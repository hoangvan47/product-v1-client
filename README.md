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
npm install
```

## Run
```bash
npm run codegen
npm run dev
```

Frontend URL: `http://localhost:5173`

## Luồng chính
1. Login/Register người bán.
2. Tạo sản phẩm với validation (`react-hook-form` + `zod`).
3. Tạo room livestream.
4. Mở `host-room/:roomId` để phát live.
5. Người xem mở `join-room/:roomId`.
6. Chat realtime + share sản phẩm + mua trong live.

## State management
- Token auth, danh sách room lưu bằng Zustand tại `src/store/app-store.ts`.

# product-v1-client
