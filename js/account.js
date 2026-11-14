import { SupabaseService } from './supabase.js';
import { Config } from './config.js';

export async function requireAccount() {
    document.querySelector('.app-layout').hidden = true;
    SupabaseService.initClient();
    const existing = await SupabaseService.getCurrentUser();
    if (existing) { document.querySelector('.app-layout').hidden = false; return existing; }
    const screen=document.createElement('main');screen.className='account-screen';
    screen.innerHTML=`<section class="account-card"><div class="brand-icon" aria-hidden="true"><img src="assets/logo.svg" alt=""></div><h1>Çalışma alanına hoş geldin</h1><p>Programını her cihazda kendi hesabınla takip et.</p><form id="accountForm"><div class="view-switch"><button type="button" data-account-mode="login" aria-pressed="true">Giriş yap</button><button type="button" data-account-mode="register" aria-pressed="false">Kayıt ol</button></div><label>Ad<input class="form-input" name="firstName" autocomplete="given-name" minlength="2" maxlength="60" required></label><label>Soyad<input class="form-input" name="lastName" autocomplete="family-name" minlength="2" maxlength="60" required></label><label>6 haneli şifre<input class="form-input" name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="current-password" required></label><label id="pinConfirmLabel" hidden>Şifreyi tekrar yaz<input class="form-input" name="confirmPin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password"></label><p id="accountHelp">Kayıt olurken kullandığın ad ve soyadla giriş yap.</p><p id="accountError" role="alert"></p><button type="submit" class="btn btn-primary">Giriş yap</button></form></section>`;
    document.body.append(screen);
    const form=screen.querySelector('form');let mode='login';
    screen.querySelectorAll('[data-account-mode]').forEach(button=>button.addEventListener('click',()=>{
        mode=button.dataset.accountMode;
        screen.querySelectorAll('[data-account-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
        form.querySelector('[type=submit]').textContent=mode==='register'?'Hesap oluştur':'Giriş yap';
        screen.querySelector('#pinConfirmLabel').hidden=mode!=='register';
        form.elements.confirmPin.required=mode==='register';
        form.elements.pin.autocomplete=mode==='register'?'new-password':'current-password';
        screen.querySelector('#accountHelp').textContent=mode==='register'?'Ad-soyadın hesap adın olacak. Şifreni sakla; e-posta olmadan otomatik şifre kurtarma yapılamaz.':'Kayıt olurken kullandığın ad ve soyadla giriş yap.';
    }));
    return new Promise(resolve=>form.addEventListener('submit',async event=>{
        event.preventDefault();const button=form.querySelector('[type=submit]'),error=screen.querySelector('#accountError');error.textContent='';
        if(mode==='register'&&form.elements.pin.value!==form.elements.confirmPin.value){error.textContent='Şifreler aynı olmalı.';return;}
        button.disabled=true;
        try {
            const response=await fetch(Config.getSupabaseUrl()+'/functions/v1/name-login',{method:'POST',headers:{'Content-Type':'application/json',apikey:Config.getSupabaseAnonKey()},body:JSON.stringify({mode,firstName:form.elements.firstName.value,lastName:form.elements.lastName.value,pin:form.elements.pin.value})});
            const result=await response.json();if(!response.ok)throw new Error(result.error||'Giriş yapılamadı.');
            const client=SupabaseService.getClient();const session=await client.auth.setSession(result);if(session.error)throw session.error;
            const user=await SupabaseService.getCurrentUser();if(!user)throw new Error('Oturum doğrulanamadı.');
            form.reset();screen.remove();document.querySelector('.app-layout').hidden=false;resolve(user);
        }catch(err){error.textContent=err.message||'Bağlantı kurulamadı.';}finally{button.disabled=false;}
    }));
}
