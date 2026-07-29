# Nutrition Tracker

A small offline mobile app for recording meals and tracking daily calories.
It is a learning project built with React Native and Expo, focused on clean local state,
simple navigation, and persistent on-device storage.

## Features

- Add a meal name and calorie value for the current day.
- Validate required fields and positive calorie values.
- View the daily calorie total.
- Remove an individual meal entry.
- Keep separate records by date.
- Browse saved days and their total calories.
- Display a basic daily statistics screen.

## Privacy

The app stores meal records locally with AsyncStorage. It has no user account, no backend,
and no cloud synchronization in the current version.

This project is a personal tracker prototype, not medical or nutritional advice.

## Technology

- React Native
- Expo and Expo Router
- TypeScript
- React Navigation
- AsyncStorage

## Run locally

Requirements: Node.js and a supported Expo environment.

```bash
npm install
npx expo start
```

From the Expo developer tools, open the app in Expo Go, an Android emulator, an iOS simulator,
or a web browser when available.

## Quality check

```bash
npm run lint
```

## Current status

The core daily tracking, history, and local persistence flow works. Planned improvements include
weekly/monthly charts, stronger UI consistency, and broader language support.

## Repository purpose

This is a public learning project. It demonstrates mobile UI structure, local persistence,
TypeScript models, and small-feature delivery rather than a production health product.
