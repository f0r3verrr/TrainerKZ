# Тренажёр: социальное предпринимательство

Статический сайт на Vite: вопросы собираются из `ekzamen.md` в `public/questions.json` при каждой сборке.

## Локально

```bash
npm install
npm run dev
```

Откройте адрес из терминала (обычно `http://localhost:5173`).

## Сборка

```bash
npm run build
```

Результат в папке `dist/`.

## GitHub Pages

1. В репозитории: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Запушьте ветку `main`: workflow **Deploy to GitHub Pages** соберёт проект и опубликует `dist/`.

В [vite.config.js](vite.config.js) задано `base: './'`, чтобы ресурсы корректно открывались по адресу вида `https://ВАШ_ЛОГИН.github.io/ИМЯ_РЕПО/`.

Если сайт публикуется с корня пользовательского домена (`username.github.io` без подпапки), можно заменить на `base: '/'`.

### Обновление вопросов

Правьте `ekzamen.md`, затем коммитьте изменения. При `npm run build` и на CI скрипт `scripts/parse-exam.mjs` заново генерирует `public/questions.json`.
