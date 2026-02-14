import { zodResolver } from '@hookform/resolvers/zod';
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
  Image,
  Input,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../lib/api-client';

declare global {
  interface Window {
    FlutterChannel?: {
      postMessage: (message: string) => void;
    };
    receiveFromFlutter?: (rawMessage: string) => void;
  }
}

type Product = {
  id: number;
  title: string;
  description: string;
  price: number;
  imageUrl: string;
  status: 'DRAFT' | 'LIVE' | 'ACTIVE' | 'OUT_OF_STOCK' | 'ARCHIVED';
};

type AuthResponse = {
  user: { id: number; email: string };
  accessToken: string;
  refreshToken: string;
};

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

const heroImage = 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1800&q=80';
type DrawerMode = 'login' | 'register' | 'livestream';

const statusLabel: Record<Product['status'], string> = {
  DRAFT: 'Nháp',
  LIVE: 'Đang live',
  ACTIVE: 'Đang bán',
  OUT_OF_STOCK: 'Hết hàng',
  ARCHIVED: 'Lưu trữ',
};

export default function FramerPreviewPage() {
  const [timeText, setTimeText] = useState('');
  const [messageFromFlutter, setMessageFromFlutter] = useState<string>('');
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('register');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [pendingApprovalEmail, setPendingApprovalEmail] = useState<string | null>(null);
  const [loggedInEmail, setLoggedInEmail] = useState<string | null>(null);

  const productsQuery = useQuery({
    queryKey: ['fjord-products'],
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

  useEffect(() => {
    const formatter = new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    const tick = () => setTimeText(formatter.format(new Date()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const sendToFlutter = (type: string, payload: Record<string, unknown>) => {
      if (!window.FlutterChannel?.postMessage) {
        return;
      }
      window.FlutterChannel.postMessage(JSON.stringify({ source: 'react', type, payload }));
    };

    window.receiveFromFlutter = (rawMessage: string) => {
      try {
        const parsed = JSON.parse(rawMessage) as { type?: string };
        setMessageFromFlutter(parsed.type ?? 'unknown_message');
      } catch {
        setMessageFromFlutter('invalid_payload');
      }
    };

    sendToFlutter('react_ready', { page: 'home_fjord_live', timestamp: Date.now() });
    return () => {
      window.receiveFromFlutter = undefined;
    };
  }, []);

  const year = useMemo(() => new Date().getFullYear(), []);

  const openDrawer = (mode: DrawerMode) => {
    setDrawerMode(mode);
    setIsDrawerOpen(true);
  };

  const submitRegister = (values: z.infer<typeof registerSchema>) => {
    setPendingApprovalEmail(values.email);
    registerForm.reset();
    setIsDrawerOpen(false);
  };

  const submitLivestream = (values: z.infer<typeof livestreamSchema>) => {
    const route = values.role === 'seller' ? '/host-room' : '/join-room';
    window.open(`${route}/${encodeURIComponent(values.roomId)}`, '_blank', 'noopener,noreferrer');
  };

  const loginMutation = useMutation({
    mutationFn: async (values: z.infer<typeof authSchema>) => (await api.post<AuthResponse>('/auth/login', values)).data,
    onSuccess: (data) => {
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      setLoggedInEmail(data.user.email);
      authForm.reset({ email: data.user.email, password: '' });
      setIsDrawerOpen(false);
    },
  });

  return (
    <Box minH="100vh" bg="#0a0b0f" color="#f5f7ff">
      <Box position="sticky" top={0} zIndex={30} borderBottom="1px solid" borderColor="whiteAlpha.200" bg="rgba(10,11,15,0.9)" backdropFilter="blur(8px)">
        <Flex maxW="1220px" mx="auto" align="center" justify="space-between" px={{ base: 4, md: 8 }} py={4}>
          <Box>
            <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.22em" color="cyan.300">
              Fjord Live Commerce
            </Text>
            <Text fontSize="xs" color="whiteAlpha.700">
              Việt Nam • {timeText || '--:--:--'}
            </Text>
          </Box>
          <Flex gap={2}>
            <Button variant="solid" colorScheme="teal" borderRadius="full" size="sm" onClick={() => openDrawer('login')}>
              {loggedInEmail ? 'Đã đăng nhập' : 'Đăng nhập'}
            </Button>
            <Button variant="outline" colorScheme="cyan" borderRadius="full" size="sm" onClick={() => openDrawer('register')}>
              Đăng ký
            </Button>
            <Button colorScheme="cyan" borderRadius="full" size="sm" onClick={() => openDrawer('livestream')}>
              Livestream
            </Button>
          </Flex>
        </Flex>
      </Box>

      <Box maxW="1220px" mx="auto" px={{ base: 4, md: 8 }} py={{ base: 6, md: 10 }}>
        <Box position="relative" overflow="hidden" borderRadius="24px" border="1px solid" borderColor="whiteAlpha.200" bg="#10131b">
          <Image src={heroImage} alt="hero" h={{ base: '340px', md: '500px' }} w="full" objectFit="cover" opacity={0.7} />
          <Box position="absolute" inset={0} bgGradient="linear(to-t, #0a0b0f, rgba(10,11,15,0.3), transparent)" />
          <Box position="absolute" left={0} right={0} bottom={0} p={{ base: 6, md: 10 }}>
            <Heading maxW="3xl" fontSize={{ base: '4xl', md: '7xl' }} lineHeight={0.95} textTransform="uppercase">
              Mua bán trực tiếp theo phiên live
            </Heading>
            <Text mt={3} maxW="xl" fontSize={{ base: 'sm', md: 'md' }} color="whiteAlpha.800">
              Trang chủ hiển thị sản phẩm, đăng ký người bán và tham gia phòng live ngay từ các nút hành động.
            </Text>
            <Button mt={4} colorScheme="cyan" borderRadius="full" onClick={() => openDrawer('register')}>
              Đăng ký người bán ngay
            </Button>
          </Box>
        </Box>

        {pendingApprovalEmail && (
          <Box mt={4} border="1px solid" borderColor="orange.300" bg="orange.400" color="white" opacity={0.9} borderRadius="12px" px={4} py={3} fontSize="sm">
            {pendingApprovalEmail} đã gửi đăng ký với trạng thái <Text as="span" fontWeight="bold">PENDING_APPROVAL</Text>. Vui lòng chờ admin duyệt.
          </Box>
        )}

        <Box mt={6} borderRadius="24px" border="1px solid" borderColor="whiteAlpha.200" bg="#10131b" p={{ base: 4, md: 6 }}>
          <Flex mb={4} align="end" justify="space-between">
            <Box>
              <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.2em" color="cyan.300">
                Sản phẩm
              </Text>
              <Heading size={{ base: 'lg', md: 'xl' }}>Danh sách đang mở bán</Heading>
            </Box>
            <Text fontSize="xs" color="whiteAlpha.700">
              Tổng: {(productsQuery.data ?? []).length}
            </Text>
          </Flex>

          <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} spacing={3}>
            {(productsQuery.data ?? []).map((product) => (
              <Box key={product.id} borderRadius="16px" border="1px solid" borderColor="whiteAlpha.200" bg="#0b0e15" p={3}>
                <Image src={product.imageUrl} alt={product.title} h="176px" w="full" borderRadius="12px" objectFit="cover" />
                <Flex mt={3} align="start" justify="space-between" gap={2}>
                  <Text noOfLines={2} fontSize={{ base: 'sm', md: 'md' }} fontWeight="semibold">
                    {product.title}
                  </Text>
                  <Badge borderRadius="full" colorScheme="cyan" variant="outline">
                    {statusLabel[product.status]}
                  </Badge>
                </Flex>
                <Text mt={1} noOfLines={2} fontSize="xs" color="whiteAlpha.700">
                  {product.description}
                </Text>
                <Flex mt={3} align="center" justify="space-between">
                  <Text fontSize="2xl" color="cyan.300" fontWeight="bold">
                    ${product.price.toFixed(2)}
                  </Text>
                  <Button size="sm" borderRadius="full" onClick={() => openDrawer('livestream')}>
                    Xem trong live
                  </Button>
                </Flex>
              </Box>
            ))}
          </SimpleGrid>
          {!productsQuery.isLoading && (productsQuery.data ?? []).length === 0 && (
            <Box mt={4} borderRadius="8px" border="1px solid" borderColor="whiteAlpha.200" px={3} py={2}>
              <Text fontSize="sm" color="whiteAlpha.700">
                Chưa có sản phẩm nào được đăng bán.
              </Text>
            </Box>
          )}
        </Box>
      </Box>

      <Drawer isOpen={isDrawerOpen} placement="right" onClose={() => setIsDrawerOpen(false)}>
        <DrawerOverlay />
        <DrawerContent bg="#0b0e15" color="white" maxW="md">
          <DrawerBody p={6}>
            <Flex align="center" justify="space-between">
              <Heading size="md">
                {drawerMode === 'login' ? 'Đăng nhập' : drawerMode === 'register' ? 'Đăng ký người bán' : 'Tham gia livestream'}
              </Heading>
              <CloseButton onClick={() => setIsDrawerOpen(false)} />
            </Flex>

            {drawerMode === 'login' ? (
              <Stack mt={5} spacing={3}>
                <Text fontSize="sm" color="whiteAlpha.700">
                  Đăng nhập để dùng đầy đủ chức năng tạo và điều phối livestream.
                </Text>
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
                <Text fontSize="sm" color="whiteAlpha.700">
                  Sau khi gửi, tài khoản sẽ ở trạng thái PENDING_APPROVAL để admin CMS duyệt.
                </Text>
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
                <Text fontSize="sm" color="whiteAlpha.700">
                  Nhập mã phòng để tham gia phiên live. Chọn đúng vai trò tham gia.
                </Text>
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

      <Box borderTop="1px solid" borderColor="whiteAlpha.200" px={{ base: 4, md: 8 }} py={4}>
        <Grid maxW="1220px" mx="auto" gap={2}>
          <Text textAlign="center" fontSize="xs" color="whiteAlpha.600">
            {year} Fjord Live Commerce.
          </Text>
          <Flex align="center" justify="center" gap={2}>
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
