<p align="center">
  <strong>opencode-samet</strong><br />
  opencode kodlama ajanı için Telegram köprüsü ve kurulum arayüzü.
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.tr.md">Türkçe</a>
</p>

---

Bu depo, [opencode](https://github.com/anomalyco/opencode) projesinin bir çatalıdır ve
`opencode-samet` komutunu ekler: Telegram sohbetinden bir opencode oturumunu yönetmenizi
sağlayan yerel bir köprü ile `http://127.0.0.1:1010` adresinde küçük bir Türkçe kurulum
arayüzü.

## Özellikler

- **Telegram aç/kapat** ve yalnızca yerel ayar dosyasında saklanan bot token'ı.
- **İsteğe bağlı proxy**: `ip:port:kullanıcı:şifre` (veya URL) biçiminde. Tanımlandığında
  özel opencode sunucusunun model istekleri ve tüm Telegram trafiği proxy üzerinden çıkar.
  Arayüz ve yerel sunucu çalışmaya devam etsin diye loopback adresleri hariç tutulur.
- **Model seçici**: bütün modelleri getirin, arayın, referansı kopyalayın ve kaydedin.
  Kaydedilen model yeni oturumlarda ve her istekte kullanılır.
- **Sürüm kontrolü ve kendi kendini güncelleme**: bu depodaki `origin/dev` ile
  karşılaştırır. **Güncelle** düğmesi `git pull` çalıştırır, `bun.lock` değiştiyse
  bağımlılıkları yeniden kurar ve köprüyü otomatik yeniden başlatır. Çalışma ağacında
  kaydedilmemiş değişiklik varsa güncelleme engellenir.
- **İki yönlü dosya ve görsel desteği**: fotoğraf, belge, video, ses ve sesli mesajlar
  `.opencode/telegram/<sohbetID>/` altına indirilir; görseller isteme eklenir. Ajanın
  çalışma klasöründe ürettiği dosyalar Telegram'a geri gönderilir.
- **Tek canlı durum mesajı**: ajan çalışırken aynı mesaj sürekli düzenlenir. Son shell
  komutları, araç çağrıları ve yorumlar burada görünür; son yanıt mesajı devralır, uzun
  yanıtlar ek mesajlarla sürer.
- **`/stop`** çalışan isteği durdurur. `/new`, `/status` ve `/help` da kullanılabilir.
- **Windows ve Linux** üzerinde çalışır.

## Bu çatalı indirip kurma

Bu çatal **npm'de yayınlanmaz**. `npm install -g opencode-ai` ve
[opencode.ai](https://opencode.ai) adresindeki kurulum betiği üst projeyi kurar ve
`opencode-samet` komutunu **içermez**. Bunun yerine bu depoyu kurun.

### Gereksinimler

- [Bun](https://bun.sh) 1.4 veya üzeri.
- Git (klonlama ve uygulama içi güncelleme kontrolü için).
- [@BotFather](https://t.me/BotFather) üzerinden alınmış Telegram bot token'ı.
- Ajanın kullanabileceği bir opencode sağlayıcısı/modeli.

### Windows

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
git clone https://github.com/same-t/opencode.git
cd opencode
bun install
bun run dev:samet
```

### Linux / macOS

```bash
curl -fsSL https://bun.sh/install | bash
git clone https://github.com/same-t/opencode.git
cd opencode
bun install
bun run dev:samet
```

`dev:samet`, köprüyü depo kökünde başlatır ve kurulum arayüzünü
<http://127.0.0.1:1010> adresinde açar. İlk çalıştırmada arayüzden yalnızca bot
token'ı girmeniz yeterlidir; ayrıntılar için [Kurulum arayüzü](#kurulum-arayüzü)
bölümüne bakın. Bun'u yeni kurduysanız `bun` komutunun `PATH` üzerinde olması için önce
yeni bir terminal açın.

### `opencode-samet` komutunu global kurma

Depo kökü yerine her projeden çalıştırmak için:

```bash
cd packages/cli
bun link
```

`bun link`, bu çatalın `opencode` ve `opencode2` komutlarını da kullanıma açar.
Ardından:

```bash
opencode-samet                       # geçerli klasörde çalış
opencode-samet /yol/proje            # başka bir klasörde çalış
opencode-samet /yol/proje --port 1011
```

Kabuk komutu bulamazsa Bun'un global bin klasörünü `PATH` değişkenine ekleyin:
Linux/macOS için `~/.bun/bin`, Windows için `%USERPROFILE%\.bun\bin`.

Köprü her zaman kendi özel opencode sunucusunu başlatır; böylece proxy ayarı yalnızca bu
köprüyü etkiler.

### Çatalı güncelleme

Kurulum arayüzünde **Güncelleme Kontrol** → **Güncelle** yolunu kullanın veya elle
güncelleyin:

```bash
cd opencode
git pull
bun install
```

Arayüz güncellemeyi yapıp köprüyü otomatik yeniden başlatır. Elle güncelledikten sonra
`opencode-samet` komutunu yeniden başlatmanız gerekir.

## Kurulum arayüzü

Komutu başlattıktan sonra <http://127.0.0.1:1010> adresini açın.

1. **Telegram**: bot token'ını yapıştırıp anahtarı açın. Token kaydedilmeden önce
   `getMe` ile doğrulanır.
2. **Proxy**: `ip:port:kullanıcı:şifre` girin ve **Kaydet**'e basın. **Test et**
   bağlantıyı dener, **Proxy'yi kaldır** ayarı siler. Proxy değişiklikleri süreci yeniden
   başlatır.
3. **Model**: **Modelleri Getir**'e basın, bir model seçin, ardından **Kopyala** veya
   **Kaydet** kullanın.
4. **Sürüm Kontrol**: **Güncelleme Kontrol** ile GitHub ile karşılaştırın. Yeni commit
   varsa **Güncelle** bunları indirir ve köprüyü yeniden başlatır.
5. **Durum**: bot, çalışma klasörü, oturumlar, aktif istekler ve son hata burada görünür.

Arayüz yalnızca `127.0.0.1` üzerinde dinler.

## Telegram komutları

| Komut     | Açıklama                                                     |
| --------- | ------------------------------------------------------------ |
| `/stop`   | Çalışan isteği durdurur (`/iptal` takma adı).                |
| `/new`    | Yeni bir opencode oturumu başlatır (`/reset` takma adı).     |
| `/status` | Seçili modeli, klasörü, oturumu ve aktif istekleri gösterir. |
| `/help`   | Yardım mesajını gösterir.                                    |

Her sohbet kendi opencode oturumunu kullanır. Bir sohbetin mesajları sırayla işlenir;
`/stop` istek çalışırken bile hemen yanıtlanır.

## Dosyalar ve sınırlar

- Telegram bot indirmeleri 20 MB ile sınırlıdır; daha büyük dosyalar reddedilir.
- Gelen dosyalar çalışma klasöründeki `.opencode/telegram/<sohbetID>/` altına kaydedilir.
  İsteme dosyanın tam yolu verilir; ajan dosyayı açıp değiştirebilir.
- Görseller ayrıca görsel parçası olarak eklenir; görsel destekli modeller onları doğrudan
  görür.
- Giden dosyalar çalışma klasörünün içinde olmalıdır. 10 MB'a kadar görseller fotoğraf,
  diğerleri belge olarak gönderilir.

## Ayarlar ve ortam değişkenleri

Ayarlar `~/.config/opencode/samet.json` dosyasında tutulur ve platform destekliyorsa
yalnızca dosya sahibinin okuyabileceği izinlerle yazılır. Dosya bot token'ını, proxy'yi,
seçili modeli ve sohbet başına oturum kimliklerini saklar.

| Değişken                      | Amaç                                                                      |
| ----------------------------- | ------------------------------------------------------------------------- |
| `OPENCODE_CONFIG_DIR`         | Ayar klasörünü değiştirir.                                                |
| `OPENCODE_SAMET_DIRECTORY`    | Klasör argümanı verilmediğinde kullanılacak çalışma klasörü.              |
| `OPENCODE_SAMET_TELEGRAM_API` | Telegram API adresi; testler için kullanışlıdır.                          |
| `OPENCODE_BUN_PATH`           | `opencode-samet` başlatıcısının kullanacağı Bun çalıştırılabilir dosyası. |

## Geliştirme

Kontrolleri `packages/cli` içinden çalıştırın:

```bash
bun run typecheck
bun test test/samet.test.ts
bun x oxlint src/samet
bun x prettier --check "src/samet/*.ts"
```

Uygulama `packages/cli/src/samet/` altındadır:

- `app.ts` — kurulum sunucusu, ayar API'si, Telegram yoklaması, canlı mesaj, dosyalar.
- `bridge.ts` — opencode istemcisi ve olayları duruma çevirme.
- `telegram.ts` — proxy, yükleme ve indirme destekli Telegram Bot API istemcisi.
- `proxy.ts` — proxy ayrıştırma, maskeleme, ortam ve bağlantı testi.
- `update.ts` — git güncelleme kontrolü, çekme ve bağımlılık yenileme.
- `page.ts` — Türkçe kurulum arayüzü.

`packages/samet/` altındaki eski bağımsız uygulama `opencode-samet` komutu tarafından
kullanılmaz.

## Lisans

MIT. Bkz. [LICENSE](LICENSE). opencode, özgün yazarlarının telif hakkıdır.
