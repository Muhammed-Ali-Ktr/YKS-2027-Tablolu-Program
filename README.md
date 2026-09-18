# YKS 2027 Kişisel Çalışma Programı (HTML5 / CSS3 / Vanilla JS + Supabase)

YKS 2027'ye hazırlanan öğrencilerin kendi kişisel çalışma programlarını tamamen manuel ve esnek bir biçimde oluşturmasını, derslerin çalışma günlerini sistemin otomatik ve dinamik olarak numaralandırmasını sağlayan modern, sade, hızlı ve responsive bir web uygulamasıdır.

---

## 🚀 Öne Çıkan Özellikler

1. **Manuel Planlama Odaklı**:
   - Sistem yapay zekâ veya otomatik şablonla kullanıcı adına karar vermez. Hangi gün hangi dersin çalışılacağını tamamen siz belirlersiniz.
2. **Dinamik ve Global Ders Numaralandırması**:
   - Bir ders programa eklendiğinde sistem o dersin kaçıncı çalışması olduğunu anlık hesaplar (Örn: *1. Gün TYT Matematik 1*, *2. Gün TYT Matematik 2*).
   - Aradaki bir ders silindiğinde veya gün değiştirildiğinde sonraki tüm numaralar otomatik olarak yeniden hizalanır (asla statik/bozuk numara kalmaz).
3. **Mükerrer ve Limit Koruması**:
   - Aynı gün içine aynı dersin iki kez eklenmesi engellenir.
   - Dersin toplam çalışma günü (örn. 70 gün) aşılamaz, limit dolduğunda bilgilendirme yapılır.
4. **İki Ayrı Mod**:
   - **Programı Oluştur (Düzenleme Modu)**: Günlere `+ Ders Ekle` butonuyla ders yerleştirme, silme ve düzenleme.
   - **Programı Kullan (Çalışma Modu)**: Dikkat dağıtmayan sade görünüm, çalışma checkbox'ları (`☐` / `☑`), tamamlanan çalışmaların üstünün çizilmesi.
5. **Geri Sayım & Takvim**:
   - YKS 2027 sınav tarihi ve başlangıç tarihi üzerinden *"Sınava X gün kaldı"* dinamik sayacı ve tüm günlerin takvim kartları.
6. **Hazır Ders Kataloğu (Örnek Veriler)**:
   - Mert Hoca (TYT Matematik 70 gün / AYT Matematik 90 gün)
   - Dr Biyoloji (TYT Biyoloji 30 gün / AYT Biyoloji 50 gün)
   - Özcan Aykın (TYT Fizik 55 gün / AYT Fizik 90 gün)
   - Benim Hocam / Görkem Şahin (TYT Kimya 50 gün / AYT Kimya 70 gün)
   - *Doğrudan YouTube oynatma listesi butonları ile tek tıkla videolara erişim.*
7. **Supabase Bulut Senkronizasyonu & Çift Mod**:
   - Supabase bilgileri girildiğinde PostgreSQL + Row Level Security (RLS) ile veriler buluta kaydedilir.
   - Supabase henüz bağlanmamışsa bile tarayıcının yerel hafızasında (LocalStorage) kesintisiz çalışır.

---

## 📂 Dosya Yapısı

```
YKS 2027/
├── index.html                 # Ana semantic HTML arayüzü
├── css/
│   ├── style.css              # Temel renk paleti, tipografi, layout, sidebar & header
│   ├── components.css         # Gün kartları, ders öğeleri, modallar, butonlar, toastlar
│   └── responsive.css         # Mobil & tablet için dikey kart ve dokunmatik uyumluluk
├── js/
│   ├── config.js              # Supabase URL & Anon Key yapılandırması
│   ├── supabase.js            # Supabase istemcisi, Auth ve CRUD işlemleri
│   ├── state.js               # Uygulama durum yönetimi ve başlangıç dersleri
│   ├── scheduler.js           # Dinamik numaralandırma algoritması ve tarih fonksiyonları
│   ├── ui.js                  # Arayüz render, modal ve toast yönetimi
│   └── app.js                 # Ana giriş noktası ve event listener'lar
├── tests/
│   └── test_scheduler.js      # Dinamik numaralandırma ve limit kontrolü doğrulama testi
├── supabase_schema.sql        # Supabase SQL Editor için hazır veritabanı şeması
└── README.md                  # Kullanım ve kurulum kılavuzu
```

---

## 🛠️ Kurulum ve Çalıştırma

### 1. Yerel Olarak Çalıştırma (Hızlı Başlangıç)
Projeyi herhangi bir yerel HTTP sunucusu ile açabilirsiniz (ES modülleri kullanıldığı için doğrudan `file://` yerine HTTP sunucusu önerilir):

```bash
# VS Code Live Server eklentisiyle veya Python ile:
python -m http.server 3000

# veya Node.js ile:
npx serve .
```
Tarayıcınızda `http://localhost:3000` adresine gidin.

### 2. Supabase Veritabanı Kurulumu (İsteğe Bağlı ama Önerilen)
1. [supabase.com](https://supabase.com) adresinde ücretsiz bir proje oluşturun.
2. Sol menüden **SQL Editor** bölümüne gidin.
3. Proje klasöründeki [`supabase_schema.sql`](supabase_schema.sql) dosyasının içeriğini kopyalayıp SQL Editor'e yapıştırın ve **Run** butonuna tıklayın.
4. Supabase Dashboard > **Project Settings > API** bölümünden:
   - `Project URL`
   - `anon public` Key
   bilgilerini kopyalayın.
5. Sitede sol menüden **Ayarlar** sekmesine gelin, bu bilgileri yapıştırıp **Bağlantıyı Kaydet & Test Et** butonuna basın.
6. Sol alttaki **Hesap / Bulut** butonundan e-posta ve şifrenizle kayıt olabilir veya giriş yapabilirsiniz. RLS sayesinde her öğrenci yalnızca kendi programına erişebilir.

---

## 🧪 Senaryo Doğrulaması (Test)

Projede yer alan dinamik numaralandırma mantığını komut satırından doğrulamak için:

```bash
node tests/test_scheduler.js
```
Bu test:
- 1., 2., 3. ve 4. günlere dersler yerleştirildiğinde numaraların `TYT Matematik 1`, `TYT Matematik 2`, `TYT Matematik 3` olmasını,
- 3. gündeki TYT Matematik silindiğinde geriye kalanların anında `TYT Matematik 1` ve `TYT Matematik 2` olarak yeniden hesaplanmasını,
- Aynı güne mükerrer ders eklenmesinin engellenmesini,
- Dersin toplam gün limitinin dolduğunda eklemenin durdurulmasını otomatik olarak test eder.
