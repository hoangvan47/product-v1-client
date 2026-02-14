import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { io, Socket } from 'socket.io-client';
import { z } from 'zod';
import { api } from './lib/api-client';
import { useAppStore } from './store/app-store';

type Profile = { sub: number; email: string };
type ProductStatus = 'DRAFT' | 'LIVE' | 'ACTIVE' | 'OUT_OF_STOCK' | 'ARCHIVED';
type Product = {
  id: number;
  title: string;
  description: string;
  price: number;
  imageUrl: string;
  status: ProductStatus;
  sellerId: number;
};
type Room = {
  id: string;
  title: string;
  status: 'active' | 'ended';
  viewerCount: number;
  sellerId: number;
};
type AuthResponse = {
  user: { id: number; email: string };
  accessToken: string;
  refreshToken: string;
};
type Order = {
  id: number;
  source: 'LIVE' | 'STORE';
  status: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELED';
  totalAmount: number;
  roomId?: string | null;
  items: Array<{
    id: number;
    quantity: number;
    price: number;
    product: Product;
  }>;
};

type SignalPayload = {
  type: 'offer' | 'answer' | 'ice-candidate';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

const authSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
});
const productSchema = z.object({
  title: z.string().min(2, 'Tên sản phẩm quá ngắn'),
  description: z.string().min(5, 'Mô tả tối thiểu 5 ký tự'),
  price: z.number().positive('Giá phải lớn hơn 0'),
  imageUrl: z.string().url('URL ảnh không hợp lệ'),
  status: z.enum(['DRAFT', 'LIVE', 'ACTIVE', 'OUT_OF_STOCK', 'ARCHIVED']),
});
const roomSchema = z.object({
  title: z.string().min(3, 'Tên room tối thiểu 3 ký tự'),
});

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

function JoinRoomPage({ roomId }: { roomId: string }) {
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [comments, setComments] = useState<Array<{ userId: number; message: string }>>([]);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState('');
  const [orderNotice, setOrderNotice] = useState<string | null>(null);

  const randomViewerId = useMemo(() => Math.floor(Math.random() * 1000000) + 1, []);
  const token = useAppStore((s) => s.accessToken);

  const profileQuery = useQuery({
    queryKey: ['viewer-profile', token],
    queryFn: async () => (await api.get<Profile>('/auth/profile')).data,
    enabled: Boolean(token),
    retry: false,
  });
  const viewerId = profileQuery.data?.sub ?? randomViewerId;

  const joinMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ room: Room }>(`/livestream/rooms/${roomId}/join`, {
          role: 'viewer',
          userId: viewerId,
        })
      ).data,
    onSuccess: (data) => setViewerCount(data.room.viewerCount),
  });

  useEffect(() => {
    joinMutation.mutate();
  }, [roomId, viewerId]);

  useEffect(() => {
    if (joinMutation.isError) {
      return;
    }
    const socket = io('http://localhost:3000/livestream', { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_room', { roomId, userId: viewerId, role: 'viewer' });
    });
    socket.on('viewer_count_updated', (payload: { roomId: string; viewerCount: number }) => {
      if (payload.roomId === roomId) {
        setViewerCount(payload.viewerCount);
      }
    });
    socket.on('comment_created', (payload: { roomId: string; userId: number; message: string }) => {
      if (payload.roomId === roomId) {
        setComments((prev) => [...prev.slice(-39), { userId: payload.userId, message: payload.message }]);
      }
    });
    socket.on('product_shared', (payload: { roomId: string; product: Product }) => {
      if (payload.roomId === roomId) {
        setFeaturedProducts((prev) => [payload.product, ...prev.filter((p) => p.id !== payload.product.id)].slice(0, 10));
      }
    });

    socket.on(
      'stream_signal',
      async (payload: { roomId: string; fromUserId: number; toUserId?: number; payload: SignalPayload }) => {
        if (payload.roomId !== roomId || (payload.toUserId && payload.toUserId !== viewerId)) {
          return;
        }

        if (!pcRef.current) {
          const pc = new RTCPeerConnection(rtcConfig);
          pc.ontrack = (event) => {
            const [stream] = event.streams;
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = stream;
            }
          };
          pc.onicecandidate = (event) => {
            if (!event.candidate) {
              return;
            }
            socket.emit('stream_signal', {
              roomId,
              fromUserId: viewerId,
              toUserId: payload.fromUserId,
              payload: { type: 'ice-candidate', candidate: event.candidate.toJSON() },
            });
          };
          pcRef.current = pc;
        }

        if (payload.payload.type === 'offer' && payload.payload.sdp) {
          const pc = pcRef.current!;
          await pc.setRemoteDescription(new RTCSessionDescription(payload.payload.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('stream_signal', {
            roomId,
            fromUserId: viewerId,
            toUserId: payload.fromUserId,
            payload: { type: 'answer', sdp: pc.localDescription },
          });
        }
        if (payload.payload.type === 'ice-candidate' && payload.payload.candidate) {
          await pcRef.current?.addIceCandidate(payload.payload.candidate);
        }
      },
    );

    return () => {
      socket.disconnect();
      pcRef.current?.close();
      pcRef.current = null;
    };
  }, [joinMutation.isError, roomId, viewerId]);

  const sendComment = () => {
    if (!message.trim() || !socketRef.current) {
      return;
    }
    socketRef.current.emit('send_comment', { roomId, userId: viewerId, message: message.trim() });
    setMessage('');
  };

  const buyMutation = useMutation({
    mutationFn: async (productId: number) =>
      (
        await api.post<Order>('/orders', {
          source: 'LIVE',
          roomId,
          items: [{ productId, quantity: 1 }],
        })
      ).data,
    onSuccess: (order) => {
      setOrderNotice(`Đặt hàng thành công. Mã đơn #${order.id}`);
    },
  });

  return (
    <div className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-2xl border bg-white p-4">
          <h1 className="text-2xl font-semibold">Xem livestream</h1>
          <p className="text-sm text-slate-500">Room: {roomId}</p>
          <p className="text-sm text-slate-500">Online: {viewerCount} người xem</p>
          <div className="mt-3 overflow-hidden rounded-xl bg-black">
            <video ref={remoteVideoRef} className="aspect-video w-full" autoPlay playsInline controls />
          </div>
          {joinMutation.isError && <p className="mt-3 text-sm text-rose-600">Không vào được room hoặc room đã kết thúc.</p>}
        </section>
        <section className="space-y-4">
          <div className="rounded-2xl border bg-white p-4">
            <p className="mb-2 font-semibold">Chat</p>
            <div className="max-h-40 space-y-1 overflow-auto text-sm">
              {comments.map((c, idx) => (
                <p key={`${c.userId}-${idx}`}>
                  <span className="font-medium">#{c.userId}</span>: {c.message}
                </p>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input className="flex-1 rounded-md border px-3 py-2 text-sm" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Nhập bình luận..." />
              <button className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white" onClick={sendComment}>
                Gửi
              </button>
            </div>
          </div>
          <div className="rounded-2xl border bg-white p-4">
            <p className="mb-2 font-semibold">Sản phẩm đang giới thiệu</p>
            {orderNotice && <p className="mb-2 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{orderNotice}</p>}
            <div className="space-y-2">
              {featuredProducts.map((product) => (
                <article key={product.id} className="rounded-lg border p-2">
                  <img src={product.imageUrl} alt={product.title} className="h-24 w-full rounded object-cover" />
                  <p className="mt-1 text-sm font-medium">{product.title}</p>
                  <p className="text-sm font-semibold">${product.price.toFixed(2)}</p>
                  <button
                    className="mt-2 rounded-md bg-cyan-600 px-2 py-1 text-xs text-white disabled:opacity-60"
                    onClick={() => buyMutation.mutate(product.id)}
                    disabled={buyMutation.isPending}
                  >
                    Mua trong live
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function HostRoomPage({ roomId }: { roomId: string }) {
  const socketRef = useRef<Socket | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const [comments, setComments] = useState<Array<{ userId: number; message: string }>>([]);
  const [message, setMessage] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  const profileQuery = useQuery({
    queryKey: ['host-profile'],
    queryFn: async () => (await api.get<Profile>('/auth/profile')).data,
  });
  const productsQuery = useQuery({
    queryKey: ['host-products'],
    queryFn: async () => (await api.get<Product[]>('/products')).data,
    enabled: Boolean(profileQuery.data),
  });
  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }
    const sellerId = profileQuery.data.sub;
    let active = true;

    const ensurePeer = (viewerId: number) => {
      const existing = peersRef.current.get(viewerId);
      if (existing) {
        return existing;
      }
      const pc = new RTCPeerConnection(rtcConfig);
      streamRef.current?.getTracks().forEach((track) => {
        if (streamRef.current) {
          pc.addTrack(track, streamRef.current);
        }
      });
      pc.onicecandidate = (event) => {
        if (!event.candidate) {
          return;
        }
        socketRef.current?.emit('stream_signal', {
          roomId,
          fromUserId: sellerId,
          toUserId: viewerId,
          payload: { type: 'ice-candidate', candidate: event.candidate.toJSON() },
        });
      };
      peersRef.current.set(viewerId, pc);
      return pc;
    };

    const setup = async () => {
      await api.post(`/livestream/rooms/${roomId}/join`, { role: 'seller', userId: sellerId });
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (!active) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const socket = io('http://localhost:3000/livestream', { transports: ['websocket'] });
      socketRef.current = socket;
      socket.on('connect', () => {
        socket.emit('join_room', { roomId, userId: sellerId, role: 'seller' });
      });
      socket.on('viewer_count_updated', (payload: { roomId: string; viewerCount: number }) => {
        if (payload.roomId === roomId) {
          setViewerCount(payload.viewerCount);
        }
      });
      socket.on('participant_joined', async (payload: { roomId: string; userId: number; role: 'seller' | 'viewer' }) => {
        if (payload.roomId !== roomId || payload.role !== 'viewer') {
          return;
        }
        const pc = ensurePeer(payload.userId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('stream_signal', {
          roomId,
          fromUserId: sellerId,
          toUserId: payload.userId,
          payload: { type: 'offer', sdp: pc.localDescription },
        });
      });
      socket.on('participant_left', (payload: { roomId: string; userId: number }) => {
        if (payload.roomId !== roomId) {
          return;
        }
        peersRef.current.get(payload.userId)?.close();
        peersRef.current.delete(payload.userId);
      });
      socket.on('comment_created', (payload: { roomId: string; userId: number; message: string }) => {
        if (payload.roomId === roomId) {
          setComments((prev) => [...prev.slice(-39), { userId: payload.userId, message: payload.message }]);
        }
      });
      socket.on('stream_signal', async (payload: { roomId: string; fromUserId: number; toUserId?: number; payload: SignalPayload }) => {
        if (payload.roomId !== roomId || payload.toUserId !== sellerId) {
          return;
        }
        const pc = ensurePeer(payload.fromUserId);
        if (payload.payload.type === 'answer' && payload.payload.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.payload.sdp));
        }
        if (payload.payload.type === 'ice-candidate' && payload.payload.candidate) {
          await pc.addIceCandidate(payload.payload.candidate);
        }
      });
    };

    void setup();
    return () => {
      active = false;
      socketRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
    };
  }, [profileQuery.data, roomId]);

  const sendComment = () => {
    if (!message.trim() || !profileQuery.data || !socketRef.current) {
      return;
    }
    socketRef.current.emit('send_comment', { roomId, userId: profileQuery.data.sub, message: message.trim() });
    setMessage('');
  };

  const shareProduct = () => {
    if (!selectedProductId || !profileQuery.data || !socketRef.current) {
      return;
    }
    const product = (productsQuery.data ?? []).find((item) => item.id === selectedProductId);
    if (!product) {
      return;
    }
    socketRef.current.emit('share_product', {
      roomId,
      userId: profileQuery.data.sub,
      product,
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-2xl border bg-white p-4">
          <h1 className="text-2xl font-semibold">Host livestream</h1>
          <p className="text-sm text-slate-500">Room: {roomId}</p>
          <p className="text-sm text-slate-500">Viewers online: {viewerCount}</p>
          <div className="mt-3 overflow-hidden rounded-xl bg-black">
            <video ref={localVideoRef} className="aspect-video w-full" autoPlay muted playsInline controls />
          </div>
        </section>
        <section className="space-y-4">
          <div className="rounded-2xl border bg-white p-4">
            <p className="mb-2 font-semibold">Giới thiệu sản phẩm trong live</p>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={selectedProductId ?? ''} onChange={(e) => setSelectedProductId(Number(e.target.value))}>
              <option value="">Chọn sản phẩm</option>
              {(productsQuery.data ?? []).map((product) => (
                <option key={product.id} value={product.id}>
                  {product.title} - ${product.price.toFixed(2)}
                </option>
              ))}
            </select>
            <button className="mt-2 rounded-md bg-slate-900 px-3 py-2 text-sm text-white" onClick={shareProduct}>
              Đẩy sản phẩm lên live
            </button>
          </div>
          <div className="rounded-2xl border bg-white p-4">
            <p className="mb-2 font-semibold">Chat</p>
            <div className="max-h-40 space-y-1 overflow-auto text-sm">
              {comments.map((c, idx) => (
                <p key={`${c.userId}-${idx}`}>
                  <span className="font-medium">#{c.userId}</span>: {c.message}
                </p>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input className="flex-1 rounded-md border px-3 py-2 text-sm" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Nhập bình luận..." />
              <button className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white" onClick={sendComment}>
                Gửi
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function App() {
  const path = window.location.pathname;
  if (path.startsWith('/join-room/')) {
    return <JoinRoomPage roomId={decodeURIComponent(path.replace('/join-room/', ''))} />;
  }
  if (path.startsWith('/host-room/')) {
    return <HostRoomPage roomId={decodeURIComponent(path.replace('/host-room/', ''))} />;
  }

  const queryClient = useQueryClient();
  const { accessToken, setAuth, clearAuth, rooms, addRoom } = useAppStore();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  const profileQuery = useQuery({
    queryKey: ['profile', accessToken],
    queryFn: async () => (await api.get<Profile>('/auth/profile')).data,
    enabled: Boolean(accessToken),
    retry: false,
  });
  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<Product[]>('/products')).data,
    enabled: Boolean(profileQuery.data),
  });
  const ordersQuery = useQuery({
    queryKey: ['orders', accessToken],
    queryFn: async () => (await api.get<Order[]>('/orders/me')).data,
    enabled: Boolean(profileQuery.data),
  });

  const authForm = useForm<z.infer<typeof authSchema>>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: 'demo@shop.local', password: '123456' },
  });
  const productForm = useForm<z.infer<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      title: '',
      description: '',
      price: 10,
      imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=1200',
      status: 'ACTIVE',
    },
  });
  const roomForm = useForm<z.infer<typeof roomSchema>>({
    resolver: zodResolver(roomSchema),
    defaultValues: { title: 'Livestream san pham' },
  });

  const authMutation = useMutation({
    mutationFn: async (values: z.infer<typeof authSchema>) => {
      const endpoint = authMode === 'register' ? '/auth/register' : '/auth/login';
      return (await api.post<AuthResponse>(endpoint, values)).data;
    },
    onSuccess: (data) => {
      setAuth(data.accessToken, data.refreshToken);
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
  const createProductMutation = useMutation({
    mutationFn: async (values: z.infer<typeof productSchema>) => (await api.post<Product>('/products', values)).data,
    onSuccess: () => {
      productForm.reset();
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
  const createRoomMutation = useMutation({
    mutationFn: async (values: z.infer<typeof roomSchema>) => (await api.post<Room>('/livestream/rooms', values)).data,
    onSuccess: (room) => {
      addRoom({ id: room.id, title: room.title, status: room.status });
      roomForm.reset();
    },
  });
  const createStoreOrderMutation = useMutation({
    mutationFn: async (productId: number) =>
      (
        await api.post<Order>('/orders', {
          source: 'STORE',
          items: [{ productId, quantity: 1 }],
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const errorText = useMemo(() => {
    const sourceError = (authMutation.error ?? createProductMutation.error ?? createRoomMutation.error) as AxiosError<
      { message?: string | string[] }
    > | null;
    if (!sourceError) {
      return null;
    }
    const message = sourceError.response?.data?.message;
    return Array.isArray(message) ? message.join(', ') : (message ?? 'Có lỗi xảy ra');
  }, [authMutation.error, createProductMutation.error, createRoomMutation.error]);

  const logout = () => {
    clearAuth();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    queryClient.removeQueries({ queryKey: ['profile'] });
    window.location.reload();
  };

  if (!profileQuery.data) {
    return (
      <div className="min-h-screen bg-slate-100 p-4">
        <div className="mx-auto mt-12 max-w-md rounded-2xl border bg-white p-6">
          <h1 className="text-2xl font-semibold">Đăng nhập hệ thống bán hàng</h1>
          <div className="mt-3 flex gap-2">
            <button className={`rounded-md px-3 py-2 text-sm ${authMode === 'login' ? 'bg-slate-900 text-white' : 'border'}`} onClick={() => setAuthMode('login')}>
              Login
            </button>
            <button className={`rounded-md px-3 py-2 text-sm ${authMode === 'register' ? 'bg-slate-900 text-white' : 'border'}`} onClick={() => setAuthMode('register')}>
              Register
            </button>
          </div>
          <form className="mt-4 space-y-3" onSubmit={authForm.handleSubmit((values) => authMutation.mutate(values))}>
            <input className="w-full rounded-md border px-3 py-2" placeholder="Email" {...authForm.register('email')} />
            {authForm.formState.errors.email && <p className="text-xs text-rose-600">{authForm.formState.errors.email.message}</p>}
            <input className="w-full rounded-md border px-3 py-2" type="password" placeholder="Password" {...authForm.register('password')} />
            {authForm.formState.errors.password && <p className="text-xs text-rose-600">{authForm.formState.errors.password.message}</p>}
            {errorText && <p className="text-sm text-rose-600">{errorText}</p>}
            <button className="w-full rounded-md bg-slate-900 px-3 py-2 text-white" disabled={authMutation.isPending}>
              {authMode === 'register' ? 'Đăng ký và đăng nhập' : 'Đăng nhập'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex items-center justify-between rounded-2xl border bg-white p-4">
          <div>
            <h1 className="text-2xl font-semibold">Seller Console</h1>
            <p className="text-sm text-slate-500">{profileQuery.data.email}</p>
          </div>
          <button className="rounded-md border px-3 py-2 text-sm" onClick={logout}>
            Logout
          </button>
        </header>

        {errorText && <p className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{errorText}</p>}

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border bg-white p-4">
            <h2 className="font-semibold">Tạo sản phẩm</h2>
            <form className="mt-3 space-y-2" onSubmit={productForm.handleSubmit((values) => createProductMutation.mutate(values))}>
              <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Tên sản phẩm" {...productForm.register('title')} />
              <textarea className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Mô tả" {...productForm.register('description')} />
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                type="number"
                step="0.01"
                placeholder="Giá"
                {...productForm.register('price', { valueAsNumber: true })}
              />
              <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Image URL" {...productForm.register('imageUrl')} />
              <select className="w-full rounded-md border px-3 py-2 text-sm" {...productForm.register('status')}>
                <option value="DRAFT">DRAFT</option>
                <option value="LIVE">LIVE</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="OUT_OF_STOCK">OUT_OF_STOCK</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
              <button className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white" disabled={createProductMutation.isPending}>
                Lưu sản phẩm
              </button>
            </form>
          </section>

          <section className="rounded-2xl border bg-white p-4">
            <h2 className="font-semibold">Tạo room livestream</h2>
            <form className="mt-3 space-y-2" onSubmit={roomForm.handleSubmit((values) => createRoomMutation.mutate(values))}>
              <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Tên room" {...roomForm.register('title')} />
              <button className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white" disabled={createRoomMutation.isPending}>
                Tạo room
              </button>
            </form>
            <div className="mt-3 space-y-2">
              {rooms.map((room) => (
                <article key={room.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{room.title}</p>
                  <p>ID: {room.id}</p>
                  <div className="mt-2 flex gap-2">
                    <button className="rounded-md bg-slate-900 px-2 py-1 text-xs text-white" onClick={() => window.open(`/host-room/${room.id}`, '_blank', 'noopener,noreferrer')}>
                      Host
                    </button>
                    <button className="rounded-md border px-2 py-1 text-xs" onClick={() => window.open(`/join-room/${room.id}`, '_blank', 'noopener,noreferrer')}>
                      Viewer
                    </button>
                    <button className="rounded-md border px-2 py-1 text-xs" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join-room/${room.id}`)}>
                      Copy link
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border bg-white p-4">
          <h2 className="font-semibold">Sản phẩm đang bán</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(productsQuery.data ?? []).map((product) => (
              <article key={product.id} className="rounded-lg border p-2">
                <img className="h-28 w-full rounded object-cover" src={product.imageUrl} alt={product.title} />
                <p className="mt-1 text-sm font-medium">{product.title}</p>
                <p className="text-xs text-slate-500">{product.description}</p>
                <p className="text-sm font-semibold">${product.price.toFixed(2)}</p>
                <p className="text-xs text-slate-500">Status: {product.status}</p>
                <button
                  className="mt-2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-60"
                  onClick={() => createStoreOrderMutation.mutate(product.id)}
                  disabled={createStoreOrderMutation.isPending}
                >
                  Mua ngay
                </button>
              </article>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border bg-white p-4">
          <h2 className="font-semibold">Đơn hàng gần đây</h2>
          <div className="mt-3 space-y-2">
            {(ordersQuery.data ?? []).slice(0, 8).map((order) => (
              <article key={order.id} className="rounded-lg border p-2 text-sm">
                <p className="font-medium">
                  #{order.id} - {order.source} - {order.status}
                </p>
                <p className="text-slate-500">
                  Total: ${order.totalAmount.toFixed(2)} {order.roomId ? `(room: ${order.roomId})` : ''}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
