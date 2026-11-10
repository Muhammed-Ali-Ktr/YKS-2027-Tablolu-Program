// Deploy with JWT verification disabled: this endpoint creates the session.
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';
const url = Deno.env.get('SUPABASE_URL')!;
const adminKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const publicKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const pepper = Deno.env.get('LOGIN_PEPPER') || '';
const allowedOrigin = Deno.env.get('SITE_ORIGIN') || '';
const admin = createClient(url, adminKey, {auth:{persistSession:false,autoRefreshToken:false}});
const encoder = new TextEncoder();
async function digest(value: string) {
  const key = await crypto.subtle.importKey('raw',encoder.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
Deno.serve(async request => {
  const headers = {'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
  const reply=(status:number, body:unknown)=>new Response(JSON.stringify(body),{status,headers});
  if (!allowedOrigin || pepper.length<32) return reply(503,{error:'Hesap sistemi henüz yapılandırılmadı.'});
  if(request.headers.get('origin') && request.headers.get('origin')!==allowedOrigin) return reply(403,{error:'İzin verilmeyen kaynak.'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply(405,{error:'Geçersiz istek.'});
  try {
    // Global and account buckets are atomic in PostgreSQL; no client-supplied IP trust.
    const globalLimit=await admin.rpc('consume_login_attempt',{bucket:'global',max_attempts:120,window_seconds:60});
    if(globalLimit.error)throw new Error('limiter');
    if(!globalLimit.data)return reply(429,{error:'Çok fazla deneme var. Bir dakika sonra tekrar dene.'});
    const raw=await request.text();
    if(raw.length>2048)return reply(400,{error:'İstek çok uzun.'});
    const body=JSON.parse(raw);
    const first=String(body.firstName||'').normalize('NFKC').trim().replace(/\s+/g,' ');
    const last=String(body.lastName||'').normalize('NFKC').trim().replace(/\s+/g,' ');
    const validName=(s:string)=>s.length>=2 && s.length<=60 && /^[\p{L}\p{M} '\-]+$/u.test(s);
    if(!validName(first)||!validName(last)||!/^\d{6}$/.test(body.pin)||!['login','register'].includes(body.mode))return reply(400,{error:'Ad, soyad ve 6 rakamdan oluşan şifreni kontrol et.'});
    const identity=JSON.stringify([first.toLocaleLowerCase('tr-TR'),last.toLocaleLowerCase('tr-TR')]);
    const accountHash=await digest('identity:'+identity);
    const limit=await admin.rpc('consume_login_attempt',{bucket:accountHash,max_attempts:5,window_seconds:900});
    if(limit.error)throw new Error('limiter');
    if(!limit.data)return reply(429,{error:'Bu hesap için deneme sınırına ulaşıldı. 15 dakika sonra tekrar dene.'});
    const email=accountHash+'@accounts.invalid';
    const password=await digest('password:'+identity+':'+body.pin);
    if(body.mode==='register'){
      const result=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:first+' '+last}});
      if(result.error)return reply(400,{error:'Kayıt oluşturulamadı. Bu ad-soyad kullanımda olabilir; ayırt edici bir hesap adı seç veya giriş yap.'});
    }
    const client=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await client.auth.signInWithPassword({email,password});
    if(error||!data.session)return reply(401,{error:'Ad, soyad veya şifre hatalı.'});
    return reply(200,{access_token:data.session.access_token,refresh_token:data.session.refresh_token});
  }catch{return reply(503,{error:'Hesap servisine ulaşılamadı. Daha sonra tekrar dene.'});}
});
