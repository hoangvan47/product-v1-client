import { zodResolver } from '@hookform/resolvers/zod';
import { Float, MeshDistortMaterial } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Badge,
  Box,
  Button,
  CloseButton,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerOverlay,
  Flex,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Grid,
  Heading,
  Input,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as THREE from 'three';
import { z } from 'zod';
import type { components } from '../api/generated/schema';
import { api } from '../lib/api-client';
import { useAppStore } from '../store/app-store';

declare global {
  interface Window {
    FlutterChannel?: {
      postMessage: (message: string) => void;
    };
    receiveFromFlutter?: (rawMessage: string) => void;
  }
}

type Product = components['schemas']['ProductDto'];
type RoomSummary = {
  id: string;
  title: string;
  status: 'active' | 'ended';
  sellerId?: number;
  viewerCount?: number;
};

type AuthResponse = {
  user: { id: number; email: string };
  accessToken: string;
  refreshToken: string;
};

type ThemeMode = 'aurora' | 'ember';
type DrawerMode = 'login' | 'register' | 'livestream';

const authSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
});

const registerSchema = z
  .object({
    email: z.string().email('Email không hợp lệ'),
    password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
    confirmPassword: z.string().min(6, 'Xác nhận mật khẩu tối thiểu 6 ký tự'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu xác nhận không khớp',
  });

const livestreamSchema = z.object({
  roomId: z.string().min(5, 'Room ID không hợp lệ'),
  role: z.enum(['viewer', 'seller']),
});
const createRoomSchema = z.object({
  title: z.string().min(3, 'Tên phòng tối thiểu 3 ký tự'),
});

const statusLabel: Record<Product['status'], string> = {
  DRAFT: 'Nháp',
  LIVE: 'Đang live',
  ACTIVE: 'Đang bán',
  OUT_OF_STOCK: 'Hết hàng',
  ARCHIVED: 'Lưu trữ',
};

const themeConfig: Record<ThemeMode, { bg: string; panel: string; card: string; accent: string; title: string; subtitle: string }> = {
  aurora: {
    bg: '#050811',
    panel: 'rgba(11, 16, 28, 0.86)',
    card: 'rgba(10, 18, 32, 0.95)',
    accent: '#22d3ee',
    title: 'Template động Aurora',
    subtitle: 'Hiệu ứng chuyển động mượt cho không gian live-commerce.',
  },
  ember: {
    bg: '#120708',
    panel: 'rgba(32, 10, 13, 0.86)',
    card: 'rgba(27, 11, 14, 0.96)',
    accent: '#fb7185',
    title: 'Template động Ember',
    subtitle: 'Tông ấm nổi bật sản phẩm và CTA trong livestream.',
  },
};

function Orb({ color, position, scale }: { color: string; position: [number, number, number]; scale: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (!meshRef.current) {
      return;
    }
    meshRef.current.rotation.x += delta * 0.18;
    meshRef.current.rotation.y += delta * 0.24;
    meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime + position[0]) * 0.24;
  });

  return (
    <Float speed={1.4} rotationIntensity={1.1} floatIntensity={1.2}>
      <mesh ref={meshRef} position={position} scale={scale}>
        <icosahedronGeometry args={[1, 18]} />
        <MeshDistortMaterial color={color} roughness={0.1} metalness={0.75} distort={0.4} speed={2.2} />
      </mesh>
    </Float>
  );
}

function ThreeTemplateScene({ mode }: { mode: ThemeMode }) {
  const palette =
    mode === 'aurora'
      ? { a: '#22d3ee', b: '#60a5fa', c: '#a855f7' }
      : { a: '#fb7185', b: '#f97316', c: '#facc15' };

  return (
    <Canvas camera={{ position: [0, 0, 6], fov: 48 }}>
      <ambientLight intensity={0.55} />
      <directionalLight position={[2, 2, 3]} intensity={1.3} />
      <Orb color={palette.a} position={[-2.2, 0.5, -0.4]} scale={1.2} />
      <Orb color={palette.b} position={[2, -0.6, -1]} scale={1.15} />
      <Orb color={palette.c} position={[0.2, 1.2, -1.5]} scale={0.82} />
    </Canvas>
  );
}

function ProductTiltCard({
  product,
  accent,
  cardBg,
  onJoinLive,
}: {
  product: Product;
  accent: string;
  cardBg: string;
  onJoinLive: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const onMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const rotateY = (px - 0.5) * 14;
    const rotateX = (0.5 - py) * 12;
    setTilt({ rx: rotateX, ry: rotateY });
  };

  const resetTilt = () => setTilt({ rx: 0, ry: 0 });

  return (
    <Box
      ref={ref}
      p={4}
      borderRadius="16px"
      border="1px solid"
      borderColor="whiteAlpha.200"
      bg={cardBg}
      transform={
        visible
          ? `perspective(900px) rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg) translateY(0px)`
          : 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(24px)'
      }
      opacity={visible ? 1 : 0}
      transition="transform 220ms ease, opacity 360ms ease"
      onMouseMove={onMouseMove}
      onMouseLeave={resetTilt}
      onBlur={resetTilt}
    >
      <Box h="160px" borderRadius="12px" overflow="hidden" bg="blackAlpha.300">
        <img src={product.imageUrl} alt={product.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </Box>
      <Flex mt={3} justify="space-between" align="start" gap={2}>
        <Text fontWeight="semibold" noOfLines={2}>
          {product.title}
        </Text>
        <Badge colorScheme="cyan" borderRadius="full" variant="outline">
          {statusLabel[product.status]}
        </Badge>
      </Flex>
      <Text mt={1} fontSize="sm" color="whiteAlpha.700" noOfLines={2}>
        {product.description}
      </Text>
      <Flex mt={4} align="center" justify="space-between">
        <Text fontSize="2xl" fontWeight="bold" color={accent}>
          ${product.price.toFixed(2)}
        </Text>
        <Button size="sm" borderRadius="full" onClick={onJoinLive}>
          Xem trong live
        </Button>
      </Flex>
    </Box>
  );
}

export default function FramerPreviewPage() {
  const [themeMode, setThemeMode] = useState<ThemeMode>('aurora');
  const [messageFromFlutter, setMessageFromFlutter] = useState<string>('');
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('register');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [pendingApprovalEmail, setPendingApprovalEmail] = useState<string | null>(null);
  const [loggedInEmail, setLoggedInEmail] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const rooms = useAppStore((state) => state.rooms);
  const addRoom = useAppStore((state) => state.addRoom);

  const productsQuery = useQuery({
    queryKey: ['three-products'],
    queryFn: async () => (await api.get<Product[]>('/products')).data,
  });

  const authForm = useForm<z.infer<typeof authSchema>>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: 'demo@shop.local', password: '123456' },
  });
  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });
  const livestreamForm = useForm<z.infer<typeof livestreamSchema>>({
    resolver: zodResolver(livestreamSchema),
    defaultValues: { roomId: '', role: 'viewer' },
  });
  const createRoomForm = useForm<z.infer<typeof createRoomSchema>>({
    resolver: zodResolver(createRoomSchema),
    defaultValues: { title: 'Livestream sản phẩm' },
  });

  useEffect(() => {
    setAccessToken(localStorage.getItem('accessToken'));
    setLoggedInEmail(localStorage.getItem('authEmail'));

    window.receiveFromFlutter = (rawMessage: string) => {
      try {
        const parsed = JSON.parse(rawMessage) as { type?: string };
        setMessageFromFlutter(parsed.type ?? 'unknown_message');
      } catch {
        setMessageFromFlutter('invalid_payload');
      }
    };
    return () => {
      window.receiveFromFlutter = undefined;
    };
  }, []);

  const openDrawer = (mode: DrawerMode) => {
    setDrawerMode(mode);
    setIsDrawerOpen(true);
  };

  const loginMutation = useMutation({
    mutationFn: async (values: z.infer<typeof authSchema>) => (await api.post<AuthResponse>('/auth/login', values)).data,
    onSuccess: (data) => {
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('authEmail', data.user.email);
      setAccessToken(data.accessToken);
      setLoggedInEmail(data.user.email);
      setIsDrawerOpen(false);
    },
  });
  const createRoomMutation = useMutation({
    mutationFn: async (values: z.infer<typeof createRoomSchema>) =>
      (await api.post<RoomSummary>('/livestream/rooms', values)).data,
    onSuccess: (room) => {
      addRoom({ id: room.id, title: room.title, status: room.status });
      livestreamForm.setValue('roomId', room.id);
      createRoomForm.reset({ title: 'Livestream sản phẩm' });
    },
  });

  const submitRegister = (values: z.infer<typeof registerSchema>) => {
    setPendingApprovalEmail(values.email);
    registerForm.reset();
    setIsDrawerOpen(false);
  };

  const submitLivestream = (values: z.infer<typeof livestreamSchema>) => {
    const route = values.role === 'seller' ? '/host-room' : '/join-room';
    window.open(`${route}/${encodeURIComponent(values.roomId)}`, '_blank', 'noopener,noreferrer');
  };
  const openRoom = (roomId: string, role: 'viewer' | 'seller') => {
    const route = role === 'seller' ? '/host-room' : '/join-room';
    window.open(`${route}/${encodeURIComponent(roomId)}`, '_blank', 'noopener,noreferrer');
  };
  const copyRoomLink = async (roomId: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/join-room/${roomId}`);
  };

  const activeTheme = themeConfig[themeMode];
  const isAuthenticated = Boolean(accessToken);

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('authEmail');
    setAccessToken(null);
    setLoggedInEmail(null);
  };

  return (
    <Box minH="100vh" bg={activeTheme.bg} color="white">
      <Box px={{ base: 4, md: 8 }} py={4} borderBottom="1px solid" borderColor="whiteAlpha.200">
        <Flex maxW="1280px" mx="auto" justify="space-between" align="center" wrap="wrap" gap={3}>
          <Box>
            <Text fontSize="xs" letterSpacing="0.24em" textTransform="uppercase" color={activeTheme.accent}>
              Live Commerce • ThreeJS
            </Text>
            <Text fontSize="xs" color="whiteAlpha.700">
              Giao diện động không dùng Framer
            </Text>
          </Box>
          <Flex gap={2} wrap="wrap">
            {isAuthenticated ? (
              <Button size="sm" borderRadius="full" variant="outline" onClick={logout}>
                Đăng xuất
              </Button>
            ) : null}
            <Button size="sm" borderRadius="full" colorScheme="cyan" onClick={() => openDrawer('livestream')}>
              Livestream
            </Button>
            <Button
              size="sm"
              borderRadius="full"
              onClick={() => setThemeMode((prev) => (prev === 'aurora' ? 'ember' : 'aurora'))}
            >
              Theme: {themeMode === 'aurora' ? 'Aurora' : 'Ember'}
            </Button>
          </Flex>
        </Flex>
      </Box>

      <Box maxW="1280px" mx="auto" px={{ base: 4, md: 8 }} py={{ base: 6, md: 10 }}>
        {!isAuthenticated ? (
          <Box mb={6} p={{ base: 6, md: 8 }} borderRadius="20px" border="1px solid" borderColor="whiteAlpha.300" bg={activeTheme.panel}>
            <Heading fontSize={{ base: '2xl', md: '4xl' }}>Chào mừng đến Live Commerce</Heading>
            <Text mt={3} color="whiteAlpha.800" maxW="2xl">
              Bạn cần đăng nhập để sử dụng đầy đủ tính năng. Chọn một trong hai tùy chọn bên dưới để tiếp tục.
            </Text>
            <Flex mt={5} gap={3} wrap="wrap">
              <Button size="lg" colorScheme="teal" onClick={() => openDrawer('login')}>
                Đăng nhập
              </Button>
              <Button size="lg" variant="outline" onClick={() => openDrawer('register')}>
                Đăng ký
              </Button>
            </Flex>
          </Box>
        ) : null}

        <Box position="relative" minH={{ base: '380px', md: '560px' }} borderRadius="24px" overflow="hidden" border="1px solid" borderColor="whiteAlpha.200">
          <Box position="absolute" inset={0}>
            <ThreeTemplateScene mode={themeMode} />
          </Box>
          <Box
            position="absolute"
            inset={0}
            bg={themeMode === 'aurora' ? 'radial-gradient(circle at 20% 10%,rgba(34,211,238,.2),transparent 35%)' : 'radial-gradient(circle at 20% 10%,rgba(251,113,133,.22),transparent 35%)'}
          />
          <Box position="absolute" left={{ base: 5, md: 8 }} bottom={{ base: 6, md: 8 }} maxW={{ base: '92%', md: '620px' }} bg={activeTheme.panel} border="1px solid" borderColor="whiteAlpha.300" borderRadius="20px" p={{ base: 5, md: 8 }}>
            <Heading fontSize={{ base: '2xl', md: '5xl' }} lineHeight={1.05}>
              {activeTheme.title}
            </Heading>
            <Text mt={3} color="whiteAlpha.800" fontSize={{ base: 'sm', md: 'lg' }}>
              {activeTheme.subtitle}
            </Text>
            <Flex mt={5} gap={3} wrap="wrap">
              <Button colorScheme="cyan" onClick={() => openDrawer('livestream')}>
                Tham gia phiên live
              </Button>
              {!isAuthenticated ? (
                <Button variant="outline" onClick={() => openDrawer('register')}>
                  Đăng ký người bán
                </Button>
              ) : null}
            </Flex>
          </Box>
        </Box>

        {pendingApprovalEmail && (
          <Box mt={4} borderRadius="12px" bg="orange.400" color="white" px={4} py={3} fontSize="sm">
            {pendingApprovalEmail} đã đăng ký với trạng thái <Text as="span" fontWeight="bold">PENDING_APPROVAL</Text>.
          </Box>
        )}

        <Box mt={6} p={{ base: 4, md: 6 }} borderRadius="20px" border="1px solid" borderColor="whiteAlpha.200" bg={activeTheme.panel}>
          <Flex justify="space-between" align="end" mb={4}>
            <Box>
              <Text fontSize="xs" letterSpacing="0.2em" textTransform="uppercase" color={activeTheme.accent}>
                Product Feed
              </Text>
              <Heading size={{ base: 'md', md: 'lg' }}>Sản phẩm đang mở bán</Heading>
            </Box>
            <Text fontSize="xs" color="whiteAlpha.700">
              Tổng: {(productsQuery.data ?? []).length}
            </Text>
          </Flex>

          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
            {(productsQuery.data ?? []).map((product) => (
              <ProductTiltCard key={product.id} product={product} accent={activeTheme.accent} cardBg={activeTheme.card} onJoinLive={() => openDrawer('livestream')} />
            ))}
          </SimpleGrid>
        </Box>

        <Box mt={6} p={{ base: 4, md: 6 }} borderRadius="20px" border="1px solid" borderColor="whiteAlpha.200" bg={activeTheme.panel}>
          <Flex justify="space-between" align={{ base: 'start', md: 'end' }} direction={{ base: 'column', md: 'row' }} gap={3}>
            <Box>
              <Text fontSize="xs" letterSpacing="0.2em" textTransform="uppercase" color={activeTheme.accent}>
                Livestream Rooms
              </Text>
              <Heading size={{ base: 'md', md: 'lg' }}>Tạo phòng và tham gia nhanh</Heading>
            </Box>
          </Flex>

          <Stack mt={4} spacing={3}>
            <FormControl isInvalid={Boolean(createRoomForm.formState.errors.title)}>
              <FormLabel>Tên phòng</FormLabel>
              <Input placeholder="Tên phòng livestream" {...createRoomForm.register('title')} />
              <FormErrorMessage>{createRoomForm.formState.errors.title?.message}</FormErrorMessage>
            </FormControl>
            <Flex gap={3} wrap="wrap">
              <Button
                colorScheme="cyan"
                onClick={createRoomForm.handleSubmit((values) => createRoomMutation.mutate(values))}
                isLoading={createRoomMutation.isPending}
                isDisabled={!isAuthenticated}
              >
                Tạo phòng mới
              </Button>
              {!isAuthenticated ? (
                <Text fontSize="sm" color="orange.200">
                  Bạn cần đăng nhập để tạo phòng.
                </Text>
              ) : null}
            </Flex>
          </Stack>

          <SimpleGrid mt={5} columns={{ base: 1, md: 2 }} spacing={3}>
            {rooms.map((room) => (
              <Box key={room.id} p={4} borderRadius="14px" border="1px solid" borderColor="whiteAlpha.300" bg={activeTheme.card}>
                <Flex justify="space-between" align="center" gap={2}>
                  <Text fontWeight="semibold" noOfLines={1}>
                    {room.title}
                  </Text>
                  <Badge colorScheme={room.status === 'active' ? 'green' : 'red'}>{room.status}</Badge>
                </Flex>
                <Text mt={1} fontSize="xs" color="whiteAlpha.700" noOfLines={1}>
                  {room.id}
                </Text>
                <Flex mt={3} gap={2} wrap="wrap">
                  <Button size="sm" onClick={() => openRoom(room.id, 'seller')}>
                    Host
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openRoom(room.id, 'viewer')}>
                    Join
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void copyRoomLink(room.id)}>
                    Copy link
                  </Button>
                </Flex>
              </Box>
            ))}
          </SimpleGrid>
        </Box>
      </Box>

      <Drawer isOpen={isDrawerOpen} placement="right" onClose={() => setIsDrawerOpen(false)}>
        <DrawerOverlay />
        <DrawerContent bg="#0b0f18" color="white" maxW="md">
          <DrawerBody p={6}>
            <Flex align="center" justify="space-between">
              <Heading size="md">
                {drawerMode === 'login' ? 'Đăng nhập' : drawerMode === 'register' ? 'Đăng ký người bán' : 'Tham gia livestream'}
              </Heading>
              <CloseButton onClick={() => setIsDrawerOpen(false)} />
            </Flex>

            {drawerMode === 'login' ? (
              <Stack mt={5} spacing={3}>
                <FormControl isInvalid={Boolean(authForm.formState.errors.email)}>
                  <FormLabel>Email</FormLabel>
                  <Input placeholder="Email" {...authForm.register('email')} />
                  <FormErrorMessage>{authForm.formState.errors.email?.message}</FormErrorMessage>
                </FormControl>
                <FormControl isInvalid={Boolean(authForm.formState.errors.password)}>
                  <FormLabel>Mật khẩu</FormLabel>
                  <Input type="password" placeholder="Mật khẩu" {...authForm.register('password')} />
                  <FormErrorMessage>{authForm.formState.errors.password?.message}</FormErrorMessage>
                </FormControl>
                <Button colorScheme="teal" onClick={authForm.handleSubmit((values) => loginMutation.mutate(values))} isLoading={loginMutation.isPending}>
                  Đăng nhập
                </Button>
              </Stack>
            ) : drawerMode === 'register' ? (
              <Stack mt={5} spacing={3}>
                <FormControl isInvalid={Boolean(registerForm.formState.errors.email)}>
                  <FormLabel>Email</FormLabel>
                  <Input placeholder="Email" {...registerForm.register('email')} />
                  <FormErrorMessage>{registerForm.formState.errors.email?.message}</FormErrorMessage>
                </FormControl>
                <FormControl isInvalid={Boolean(registerForm.formState.errors.password)}>
                  <FormLabel>Mật khẩu</FormLabel>
                  <Input type="password" placeholder="Mật khẩu" {...registerForm.register('password')} />
                  <FormErrorMessage>{registerForm.formState.errors.password?.message}</FormErrorMessage>
                </FormControl>
                <FormControl isInvalid={Boolean(registerForm.formState.errors.confirmPassword)}>
                  <FormLabel>Xác nhận mật khẩu</FormLabel>
                  <Input type="password" placeholder="Xác nhận mật khẩu" {...registerForm.register('confirmPassword')} />
                  <FormErrorMessage>{registerForm.formState.errors.confirmPassword?.message}</FormErrorMessage>
                </FormControl>
                <Button colorScheme="cyan" onClick={registerForm.handleSubmit(submitRegister)}>
                  Gửi đăng ký
                </Button>
              </Stack>
            ) : (
              <Stack mt={5} spacing={3}>
                <FormControl isInvalid={Boolean(livestreamForm.formState.errors.roomId)}>
                  <FormLabel>Mã phòng</FormLabel>
                  <Input placeholder="Ví dụ: ls-abc-123" {...livestreamForm.register('roomId')} />
                  <FormErrorMessage>{livestreamForm.formState.errors.roomId?.message}</FormErrorMessage>
                </FormControl>
                <FormControl>
                  <FormLabel>Vai trò</FormLabel>
                  <Select {...livestreamForm.register('role')}>
                    <option value="viewer">Người xem</option>
                    <option value="seller">Người bán</option>
                  </Select>
                </FormControl>
                <Button colorScheme="cyan" onClick={livestreamForm.handleSubmit(submitLivestream)}>
                  Mở trang phòng live
                </Button>
              </Stack>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Box borderTop="1px solid" borderColor="whiteAlpha.200" py={4}>
        <Grid maxW="1280px" mx="auto" px={{ base: 4, md: 8 }} gap={2}>
          <Text textAlign="center" fontSize="xs" color="whiteAlpha.600">
            2026 Live Commerce 3D.
          </Text>
          <Flex justify="center" gap={2} align="center">
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                window.FlutterChannel?.postMessage(
                  JSON.stringify({
                    source: 'react',
                    type: 'ping_from_react',
                    payload: { timestamp: Date.now() },
                  }),
                )
              }
            >
              Gửi tín hiệu Flutter
            </Button>
            <Text fontSize="11px" color="whiteAlpha.600">
              Flutter phản hồi: {messageFromFlutter || 'chưa có'}
            </Text>
          </Flex>
        </Grid>
      </Box>
    </Box>
  );
}
