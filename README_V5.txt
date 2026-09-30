V5 — виправлення різниці ПК/телефон

На ПК сайт читав Apps Script (дані Google), а на телефоні через custom/in-app browser падав у вбудований Excel fallback.
V5 має два незалежні джерела читання:
1) Apps Script API
2) Google Sheet Catalog напряму через GViz JSONP

На мобільному Google Sheet використовується першим. Старий Excel показується тільки якщо обидва Google-джерела недоступні.

Для GitHub Pages замініть тільки index.html. Apps Script змінювати не потрібно.
