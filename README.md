# БУ обладнання та майно — GitHub Pages каталог

Готовий статичний сайт + Google Apps Script backend для редагування каталогу і завантаження фото у Google Drive.

## Що вже є
- каталог сформований із наданого Excel;
- артикул, назва, кількість;
- наявні Google Drive фото показуються прямо на сайті;
- позиції без фото мають заглушку;
- пошук за назвою/артикулом, категорії, сортування, галерея;
- адаптивний дизайн для телефона;
- режим адміністратора;
- адміністратор може змінювати дані, вставляти Google Drive-посилання або завантажувати нові фото;
- нові фото завантажуються у визначену папку Google Drive;
- при підключеному backend каталог читається з Google Sheet, а не з GitHub-файлу.

## 1. Швидкий тест тільки сайту
Завантажте в корінь GitHub-репозиторію: `index.html`, `styles.css`, `app.js`, `data.js`, `config.js`, папку `assets` та `.nojekyll`.
У Settings → Pages увімкніть публікацію з гілки `main` / root.
Без backend сайт уже покаже початковий каталог із Excel.

## 2. Щоб редагувати через сайт і додавати фото в Google Drive
1. Створіть **Google Sheet** (порожній) і скопіюйте його ID з URL.
2. Створіть **папку Google Drive** для фото й скопіюйте ID папки з URL.
3. Відкрийте `script.google.com` → New project.
4. Створіть два файли в Apps Script: `Code.gs` і `Seed.gs`, скопіюйте в них код із папки `apps-script`.
5. У верхній частині `Code.gs` замініть:
   - `PASTE_GOOGLE_SHEET_ID`
   - `PASTE_GOOGLE_DRIVE_FOLDER_ID`
   - `CHANGE_ME_TO_A_LONG_RANDOM_KEY` на довгий власний пароль/ключ.
6. Запустіть вручну функцію `setup()` і надайте дозволи Google.
7. Запустіть один раз `seedCatalog()` — це перенесе початковий каталог із Excel у Google Sheet.
8. Deploy → **New deployment** → Type: **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
9. Скопіюйте URL виду `https://script.google.com/macros/s/.../exec`.
10. Вставте його в `config.js` у поле `API_URL`, закомітьте файл у GitHub.

Після цього сайт бере каталог із Google Sheet. Кнопка **Адміністратор** дозволяє ввести ваш ключ, додавати/редагувати позиції та фото.

## Важливо про фото
Google Drive-файли повинні бути доступні для публічного перегляду. Backend пробує автоматично виставити `Anyone with the link / Viewer` для завантажених через сайт фото. У корпоративному Google Workspace адміністратор домену може заборонити такий тип доступу — тоді доступ потрібно налаштувати відповідно до політик вашої компанії.

## Безпека
- Адмін-ключ **не зберігається у GitHub-коді сайту**; він вводиться у браузері й тримається лише в `sessionStorage` поточної вкладки.
- Сам ключ зберігається тільки у приватному `Code.gs` Apps Script.
- Публічний GET API повертає лише дані каталогу; запис/видалення потребує адмін-ключ.
- Для production краще замінити спільний ключ на Google OAuth/корпоративну авторизацію.

## Структура
```
index.html
styles.css
app.js
data.js          # початковий fallback із Excel
config.js        # URL Apps Script
assets/hero.jpg
apps-script/Code.gs
apps-script/Seed.gs
catalog-import.csv
```

Початково імпортовано 252 позиції; наявних Google Drive фото: 200.
