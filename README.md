# Fitness Market Admin

Admin portal for the Fitness Market Android app (food database, meal ideas). Web app: Vite + React + TypeScript.

**Status:** login page only. Sign-in is not connected to a backend yet; the database comes later.

```bash
npm install
npm run dev        # http://localhost:5173
npm test
npm run build
```

`LoginPage` takes an `onLogin(email, password)` prop that resolves on success or rejects with an `Error` whose
message is shown to the user. Wire real authentication in there.
