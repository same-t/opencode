# opencode-samet

Telegram ↔ OpenCode köprüsü. `opencode-samet` komutu **1010** portunda bir kurulum
arayüzü açar; Telegram'ı açıp bot token'ını girdiğinde, gelen her mesaj arka planda
OpenCode ile işlenir ve yanıt Telegram'a gönderilir.

## Hızlı başlangıç

```bash
# depo kökünde
node packages/samet/src/index.mjs

# veya bin üzerinden
opencode-samet
```

Ardından <http://127.0.0.1:1010> adresini aç:

1. **Telegram kullanılsın mı?** anahtarını aç.
2. [@BotFather](https://t.me/BotFather) → `/newbot` ile bot oluştur, token'ı kopyala.
3. Token'ı yapıştır → **Doğrula** → **Kaydet ve uygula**.
4. Telegram'da botuna `/start` yaz.

İsteğe bağlı olarak **İzinli sohbet kimlikleri** alanına yalnızca kendi sohbet
kimliğini yazabilirsin (bota `/id` yazarak öğrenilir). Boş bırakılırsa botu bulan
herkes kullanabilir.

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `opencode-samet` | 1010 portunda arayüzü başlatır |
| `opencode-samet --port 1011` | Farklı port |
| `opencode-samet --host 0.0.0.0` | Ağa aç (dikkat: parola yok) |

## Telegram içi komutlar

| Komut | Açıklama |
| --- | --- |
| `/start` | Bağlantı bilgisi |
| `/id` | Sohbet kimliği |
| `/new` | Yeni oturum (bağlamı sıfırlar) |
| `/status` | Model, klasör, oturum |
| `/help` | Yardım |

## Nasıl çalışır?

- Arayüz ve API: `node:http`, port 1010 (varsayılan `127.0.0.1`).
- Telegram: long polling (`getUpdates`), ek bağımlılık yok.
- Mesaj işleme: her mesaj için `opencode run --standalone --format json` çalıştırılır,
  JSON olay akışından asistan metni toplanır.
- Sohbet başına oturum kimliği saklanır; `/new` sıfırlar.
- Aynı sohbetteki mesajlar sırayla, farklı sohbetler paralel işlenir.

## Dosyalar

| Yol | İçerik |
| --- | --- |
| `~/.opencode-samet/config.json` | Token ve ayarlar (yalnızca yerel) |
| `~/.opencode-samet/state.json` | Sohbet → oturum eşlemesi, polling offset |
| `~/.opencode-samet/samet.log` | Günlük |
| `~/.opencode-samet/workspace` | Varsayılan çalışma klasörü |

## Güvenlik notları

- Token düz metin olarak yerel kullanıcı dizininde tutulur; arayüzde maskelenir.
- Arayüz varsayılan olarak yalnızca `127.0.0.1`'i dinler.
- `--host 0.0.0.0` kullanırsan arayüzde kimlik doğrulama olmadığını unutma.
- Otomatik onay açıkken bot, izin istemeden dosya düzenleyip komut çalıştırabilir.
