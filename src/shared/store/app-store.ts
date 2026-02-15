import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type RoomSummary = {
  id: string;
  title: string;
  status: 'active' | 'ended';
};

type AppState = {
  accessToken: string | null;
  refreshToken: string | null;
  rooms: RoomSummary[];
  setAuth: (accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  addRoom: (room: RoomSummary) => void;
  resetRooms: () => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      rooms: [],
      setAuth: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      clearAuth: () => set({ accessToken: null, refreshToken: null, rooms: [] }),
      addRoom: (room) =>
        set((state) => ({
          rooms: [room, ...state.rooms.filter((item) => item.id !== room.id)],
        })),
      resetRooms: () => set({ rooms: [] }),
    }),
    { name: 'shop-live-store' },
  ),
);
