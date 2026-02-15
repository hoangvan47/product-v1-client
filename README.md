# Frontend (React)

## Stack
- React + Vite
- Tailwind CSS
- React Query
- Zustand
- react-hook-form + zod
- Socket.IO client (livestream realtime)

## Setup
```bash
cd /Users/admin/Desktop/run-with-codeX/frontend
yarn install
```

## Run
```bash
yarn codegen
yarn dev
```

Frontend URL: `http://localhost:5173`

## Main flow
1. Seller login/register.
2. Create products with validation (`react-hook-form` + `zod`).
3. Create livestream rooms.
4. Open `host-room/:roomId` to start streaming.
5. Viewers open `join-room/:roomId`.
6. Realtime chat + product sharing + live purchase.

## State management
- Auth tokens and room list are managed with Zustand in `src/shared/store/app-store.ts`.

# product-v1-client
