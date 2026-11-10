# Hesap sistemini yayına alma

Kod hazırdır; canlı Supabase kurulumu yapılmadan yeni giriş ekranı çalışmaz. Bağlı Supabase hesabında sitenin kullandığı `imepwmcvzkezyruayoxe` projesi görünmediği için canlı işlem uygulanmadı.

1. Eski çalışan siteden Ayarlar → Yedeği indir ile programını dışa aktar. Yeni sürümü yayınlamadan önce bunu yap.
2. Doğru Supabase projesinde `supabase_migration_multi_section.sql` dosyasını çalıştır. Yeni sürüm bu dosyaya kullanıcı izolasyonunu da ekler. Eski sahipsiz kayıtlar silinmez ancak artık tarayıcıdan okunamaz. `supabase_schema.sql` dosyasını tekrar çalıştırma.
3. Edge Functions → Secrets alanına `SITE_ORIGIN` olarak sitenin tam kökenini yaz (ör. `https://program.example.com`, sonunda slash olmadan). `LOGIN_PEPPER` olarak güvenilir bir parola üreticisiyle en az 32 rastgele karakter üret ve sakla. Bunu değiştirmek mevcut hesapların girişini bozar. Anahtarı tarayıcı koduna veya Git'e koyma.
4. `supabase/functions/name-login/index.ts` dosyasını `name-login` adlı Edge Function olarak yayınla. Giriş yapılmadan çağrıldığı için yalnızca bu işlevde JWT doğrulaması kapalı olmalı (`supabase/config.toml` bunu tanımlar). İşlev kendi doğrulamasını ve veritabanı destekli deneme sınırını uygular. `SUPABASE_SERVICE_ROLE_KEY` yalnızca işlevin sunucu ortamında bulunmalıdır.
5. Supabase Auth ayarlarında email/parola sağlayıcısını açık tut; herkese açık doğrudan kullanıcı kaydını kapat. Hesaplar işlevin admin çağrısıyla açılır. Otomatik oluşturulan adresler gerçek e-posta kutuları değildir.
6. Güncellenen dosyaları HTTPS ile yayınla. İsim, soyisim ve 6 rakamla kayıt ol. Önceki planını Ayarlar → Yedek dosyası seç ile kendi hesabına yükle. Eski kayıt kimlikleri yeniden üretilir, başka hesapların kayıtlarıyla çakışmaz.
7. İki ayrı hesap ve iki cihazla doğrula: A'nın planı B'de görünmemeli; A ikinci cihazda aynı planı görmeli; yanlış şifreler reddedilmeli; beş denemeden sonra aynı hesap 15 dakika sınırlandırılmalı. Bu canlı kontroller doğru proje erişimi sağlanana kadar yapılmamıştır.

Ad-soyad bu sürümde benzersiz hesap adıdır, gerçek kimlik doğrulaması değildir. Aynı ad-soyadla ikinci hesap açılamaz; ayırt edici bir ad kullanılmalıdır. Büyük/küçük harf ve fazladan boşluklar normalize edilir. Şifre kurtarma veya değiştirme henüz yoktur; e-posta talep edilmediği için otomatik kurtarma sunulmaz. Altı haneli şifreyi bilen kişi giriş yapabilir; mutlak erişilemezlik garantisi yoktur. Sunucu sırrı ve deneme sınırı tahmin saldırılarını azaltır.

Yerel kontroller: `node tests/test_account.mjs`, `node tests/test_state.js`, `node tests/test_scheduler.js`.
