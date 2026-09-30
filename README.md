# BU Catalog — Migration Ready V7

Ця версія спеціально підготовлена так, щоб **сьогодні сайт працював із Google Drive**, а пізніше його можна було перенести на платний сервер **без втрати зв’язку між товаром і фотографіями**.

## 1. Як сайт працює зараз

Поточна схема:

```text
GitHub Pages / index.html
        ↓
Google Apps Script
   ↙            ↘
Google Sheet   Google Drive
 база товарів      фото
```

Google Drive зараз залишається основним сховищем фотографій. Але V7 додатково записує для кожного фото постійні поля:

- `fileName` — ім’я файла;
- `storageKey` — майбутній шлях файла на сервері;
- `driveId` / `id` — ID файла Google Drive;
- `driveUrl` / `url` — поточне Google Drive-посилання.

Приклад:

```json
{
  "fileName": "00-001196_20260930_081522_1.jpg",
  "storageKey": "00-001196/00-001196_20260930_081522_1.jpg",
  "id": "GOOGLE_DRIVE_FILE_ID",
  "url": "https://drive.google.com/file/d/.../view"
}
```

Саме `storageKey` не дає втратити прив’язку фото після перенесення.

---

# 2. Що потрібно зробити ЗАРАЗ після встановлення V7

## Крок 1. Оновити сайт

На GitHub замініть старий `index.html` на `index.html` із цієї папки.

У ньому зараз стоїть:

```javascript
IMAGE_PROVIDER: "google-drive",
IMAGE_BASE_URL: "./assets/catalog/",
```

Це означає: **поки що всі фото показуються з Google Drive**.

## Крок 2. Оновити Apps Script

1. Відкрийте Google Apps Script.
2. Замініть поточний `Code.gs` на файл `Code_V7.gs`.
3. Перевірте свої значення в `CONFIG`:
   - `SPREADSHEET_ID`
   - `DRIVE_FOLDER_ID`
   - `ADMIN_KEY`
   - `DELETE_KEY`
4. Збережіть.
5. `Ввести в дію` → `Керувати введеннями в дію` → олівець → **Нова версія** → `Ввести в дію`.
6. Ваш `/exec` URL залишається той самий.

## Крок 3. Один раз запустити `prepareMigration()`

У верхньому списку функцій Apps Script виберіть:

```text
prepareMigration
```

і натисніть **Запустити**.

Ця функція:

- НЕ видаляє фотографії;
- НЕ переносить фотографії;
- НЕ змінює Google Drive;
- лише дописує до `PhotosJSON` поля `fileName` та `storageKey`.

Після цього всі поточні й нові фото вже готові до майбутньої міграції.

> `prepareMigration()` достатньо запускати один раз після переходу на V7. Нові фото вже автоматично отримують `storageKey` при завантаженні.

---

# 3. КУДИ САМЕ переносити фото на платному сервері

Це найважливіший розділ.

## Правило

Папка `assets` повинна лежати **поруч із `index.html`**.

Структура сайту на сервері повинна бути такою:

```text
SITE_ROOT/
│
├── index.html
│
└── assets/
    └── catalog/
        ├── 00-001196/
        │   ├── 00-001196_20260930_081522_1.jpg
        │   └── 00-001196_20260930_081700_2.jpg
        │
        ├── 00-002488/
        │   └── 20260707_170914.jpg
        │
        └── ...
```

Тобто **точна папка для фото** відносно `index.html`:

```text
./assets/catalog/
```

а всередині неї — окрема папка для кожного артикулу:

```text
./assets/catalog/<АРТИКУЛ>/<ІМ'Я_ФАЙЛУ>
```

### Приклад для звичайного cPanel / hosting

Якщо сайт лежить у:

```text
/public_html/index.html
```

фотографії повинні бути тут:

```text
/public_html/assets/catalog/
```

Наприклад:

```text
/public_html/assets/catalog/00-001196/00-001196_20260930_081522_1.jpg
```

### Якщо сайт лежить у підпапці

Наприклад:

```text
/public_html/bu/index.html
```

тоді фотографії:

```text
/public_html/bu/assets/catalog/
```

**Головне правило: папка `assets` лежить поруч із `index.html`.**

---

# 4. Чому фото розкладені по папках артикулів

Не складайте всі фото в одну спільну папку без підпапок.

У старих фото можуть повторюватися однакові імена файлів, наприклад:

```text
20260707_181251.jpg
```

але вони можуть належати різним товарам.

Тому V7 використовує безпечну структуру:

```text
АРТИКУЛ/ІМ'Я_ФАЙЛУ
```

Наприклад:

```text
00-001146/20260707_181251.jpg
00-009999/20260707_181251.jpg
```

Так файли не затруть один одного під час перенесення.

---

# 5. Найпростіший спосіб перенести ВСІ фото з Google Drive на сервер

У папці `migration` є готовий скрипт:

```text
migration/download_photos.py
```

Він автоматично:

1. читає актуальний каталог через Apps Script;
2. отримує `driveId` кожного фото;
3. створює потрібну папку артикулу;
4. завантажує фото з Google Drive;
5. кладе його саме в той шлях, який уже записаний у `storageKey`.

Тобто вручну сортувати сотні фото по товарах не потрібно.

## Запуск

Потрібен Python 3.

Запускайте з таким форматом:

```bash
python migration/download_photos.py "ВАШ_APPS_SCRIPT_EXEC_URL" .
```

Крапка `.` означає: поточна папка — це папка сайту, де лежить `index.html`.

Приклад:

```bash
python migration/download_photos.py "https://script.google.com/macros/s/XXXXXXXX/exec" .
```

Скрипт сам створить:

```text
assets/catalog/...
```

Якщо якийсь файл не завантажився, буде створено:

```text
migration_failed.txt
```

із переліком проблемних фото.

---

# 6. Як перевести сайт з Google Drive на серверні фото

## Етап А — безпечний перехід

Після копіювання фотографій на сервер змініть в `index.html`:

```javascript
IMAGE_PROVIDER: "google-drive",
```

на:

```javascript
IMAGE_PROVIDER: "auto",
```

У режимі `auto` логіка така:

```text
1. Сайт шукає фото на сервері ./assets/catalog/...
2. Якщо файл є — показує серверне фото.
3. Якщо файла ще немає — бере його з Google Drive.
```

Це дозволяє переносити фото поступово й нічого не ламати.

## Етап Б — повністю без Google Drive для фото

Коли перевірили, що всі старі фото перенесені, змініть:

```javascript
IMAGE_PROVIDER: "server",
```

Після цього сайт **взагалі не звертатиметься до Google Drive для показу фотографій**.

Щоб і **нові фото з телефона** після цього також ішли не в Google Drive, а прямо на платний сервер, увімкніть:

```javascript
UPLOAD_PROVIDER: "server",
SERVER_UPLOAD_URL: "./server-api/upload.php",
```

Для цього у збірці вже є папка:

```text
server-api/
```

На платному сервері:

1. Скопіюйте `server-api/config.example.php` як:
   ```text
   server-api/config.php
   ```
2. У `config.php` задайте той самий `ADMIN_KEY`, який використовують редактори каталогу.
3. Переконайтесь, що PHP має право запису в:
   ```text
   ./assets/catalog/
   ```
4. Після цього нові фото з камери/телефона фізично записуються в:
   ```text
   ./assets/catalog/<АРТИКУЛ>/<ІМ'Я_ФАЙЛУ>
   ```
5. Apps Script у такій схемі зберігає лише метадані фото (`storageKey`) у Google Sheet; Google Drive для фотографій більше не потрібен.

Тобто повний режим **без Google Drive для фото**:

```javascript
IMAGE_PROVIDER: "server",
UPLOAD_PROVIDER: "server",
IMAGE_BASE_URL: "./assets/catalog/",
SERVER_UPLOAD_URL: "./server-api/upload.php",
```

При цьому `Google Sheet + Apps Script` поки можуть залишатися базою товарів. Якщо пізніше захочете прибрати й Google Sheet/Apps Script, каталог можна перенести в SQL/інший backend без повторного перенесення фотографій.

---

# 7. Режими зберігання фото

У `window.APP_CONFIG`:

```javascript
IMAGE_PROVIDER: "google-drive",
IMAGE_BASE_URL: "./assets/catalog/",
```

### `google-drive`

Поточний режим. Фото беруться з Google Drive.

### `auto`

Спочатку сервер, потім Google Drive як резерв.

Рекомендований режим під час міграції.

### `server`

Тільки платний сервер.

Рекомендований режим після повного перенесення фото.

## UPLOAD_PROVIDER

Окремо задається місце, куди потрапляють **нові** фотографії з адмінки:

```javascript
UPLOAD_PROVIDER: "google-drive"
```

— поточний режим, нові фото йдуть у Google Drive.

```javascript
UPLOAD_PROVIDER: "server"
```

— майбутній режим, нові фото йдуть прямо в `./assets/catalog/` через `server-api/upload.php`.

---

# 8. Live-маніфест усіх фото

V7 додає спеціальну адресу:

```text
ВАШ_EXEC_URL?action=manifest
```

Вона повертає список усіх фото з:

- артикулом;
- назвою товару;
- `fileName`;
- `storageKey`;
- `driveId`;
- `driveUrl`.

Саме цей маніфест використовує `download_photos.py`.

---

# 9. Повна резервна копія каталогу

Також доступна адреса:

```text
ВАШ_EXEC_URL?action=backup
```

Вона повертає:

- усі товари;
- усі фото;
- повний migration manifest.

Перед великими змінами сайту або міграцією рекомендується зберегти цей JSON як резервну копію.

---

# 10. Якщо пізніше захочете повністю відмовитись і від Google Sheet

V7 вирішує головну задачу — **фотографії вже не прив'язані назавжди до Google Drive**.

Пізніше можна зробити другий етап:

```text
Google Sheet → MySQL / PostgreSQL / JSON API на сервері
Apps Script → PHP / Node.js / Python backend
```

При цьому `storageKey` фотографій не змінюється, тому фото повторно переносити не потрібно.

---

# 11. Що НЕ робити

- Не перейменовуйте фото на сервері після міграції без оновлення `storageKey`.
- Не складайте всі фото в одну папку без папок артикулів.
- Не видаляйте Google Drive одразу після копіювання.
- Спочатку використайте `IMAGE_PROVIDER: "auto"` і перевірте каталог.
- Видаляйте/відключайте Google Drive тільки коли переконалися, що `IMAGE_PROVIDER: "server"` показує всі фото.

---

# 12. Коротка пам'ятка на майбутнє

Якщо через рік потрібно перенести сайт на платний хостинг:

1. Скопіювати `index.html` на новий сервер.
2. Поруч створити:
   ```text
   assets/catalog/
   ```
3. Запустити:
   ```bash
   python migration/download_photos.py "ВАШ_EXEC_URL" .
   ```
4. У `index.html` поставити:
   ```javascript
   IMAGE_PROVIDER: "auto"
   ```
5. Перевірити сайт.
6. Після повної перевірки поставити:
   ```javascript
   IMAGE_PROVIDER: "server"
   ```
7. Налаштувати `server-api/config.php` і поставити:
   ```javascript
   UPLOAD_PROVIDER: "server"
   ```
8. Перевірити завантаження нового фото з телефона.
9. Тільки після цього Google Drive можна більше не використовувати для фотографій сайту.

---

## Файли V7

```text
BU_Catalog_MIGRATION_V7/
├── index.html
├── Code_V7.gs
├── README.md
├── assets/
│   └── catalog/
│       ├── .gitkeep
│       └── README_PHOTOS_HERE.txt
├── migration/
│   └── download_photos.py
└── server-api/
    ├── config.example.php
    ├── upload.php
    └── README.txt
```

Ця структура вже є шаблоном майбутнього платного сервера.
