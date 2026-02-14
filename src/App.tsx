import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { workItemCreateSchema, type WorkItem, type WorkItemFormValues } from './schemas/work-item.schema';

declare global {
  interface Window {
    FlutterChannel?: {
      postMessage: (message: string) => void;
    };
    receiveFromFlutter?: (rawMessage: string) => void;
  }
}

const initialWorkItems: WorkItem[] = [
  {
    id: '01',
    title: "Design & development of the website's 3 pages",
    client: 'Brightmark Technology',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=720&q=80',
  },
  {
    id: '02',
    title: 'Brand identity refresh and launch-ready UI system',
    client: 'Nexon Labs',
    image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=720&q=80',
  },
  {
    id: '03',
    title: 'Campaign landing and performance optimization package',
    client: 'Northern Pixel',
    image: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=720&q=80',
  },
];

const heroImage =
  'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1600&q=80';

const defaultCreateValues: WorkItemFormValues = {
  title: '',
  client: '',
  image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=720&q=80',
};

export default function App() {
  const [timeText, setTimeText] = useState('');
  const [messageFromFlutter, setMessageFromFlutter] = useState<string>('');
  const [workItems, setWorkItems] = useState<WorkItem[]>(initialWorkItems);
  const [editingId, setEditingId] = useState<string | null>(null);

  const createForm = useForm<WorkItemFormValues>({
    resolver: zodResolver(workItemCreateSchema),
    defaultValues: defaultCreateValues,
  });

  const editForm = useForm<WorkItemFormValues>({
    resolver: zodResolver(workItemCreateSchema),
    defaultValues: defaultCreateValues,
  });

  useEffect(() => {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Europe/London',
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
        const parsed = JSON.parse(rawMessage) as {
          type?: string;
          payload?: Record<string, unknown>;
        };
        setMessageFromFlutter(parsed.type ?? 'unknown_message');
      } catch {
        setMessageFromFlutter('invalid_payload');
      }
    };

    sendToFlutter('react_ready', {
      page: 'echo_landing',
      timestamp: Date.now(),
    });

    return () => {
      window.receiveFromFlutter = undefined;
    };
  }, []);

  const year = useMemo(() => new Date().getFullYear(), []);

  const handleCreate = (values: WorkItemFormValues) => {
    const createdItem: WorkItem = {
      id: `${Math.floor(Math.random() * 900) + 100}`,
      ...values,
    };
    setWorkItems((prev) => [createdItem, ...prev]);
    createForm.reset(defaultCreateValues);
  };

  const handleStartEdit = (item: WorkItem) => {
    setEditingId(item.id);
    editForm.reset({
      title: item.title,
      client: item.client,
      image: item.image,
    });
  };

  const handleSaveEdit = (values: WorkItemFormValues) => {
    if (!editingId) {
      return;
    }
    setWorkItems((prev) => prev.map((item) => (item.id === editingId ? { ...item, ...values } : item)));
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    setWorkItems((prev) => prev.filter((item) => item.id !== id));
    if (editingId === id) {
      setEditingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f4f4] text-[#0d0d0d]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#080808] text-white">
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-white/30 text-lg font-bold">F</div>
            <div className="text-sm leading-tight">
              <p className="font-semibold">Base on</p>
              <p className="text-white/70">United Kingdom</p>
            </div>
          </div>
          <div className="text-right text-sm leading-tight">
            <p className="font-semibold">Currently</p>
            <p className="text-white/70">{timeText || '--:--:--'}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1240px] space-y-6 px-4 py-6 md:px-8 md:py-10">
        <section className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
          <div className="border-b border-black/10 px-4 py-4 md:px-8">
            <h1 className="text-5xl font-black uppercase tracking-tight md:text-8xl">Echo</h1>
          </div>

          <div className="relative">
            <img src={heroImage} alt="Creative team" className="h-[280px] w-full object-cover md:h-[460px]" />
            <button
              className="absolute bottom-4 right-4 rounded-full border border-white/50 bg-black/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur"
              type="button"
            >
              View Project
            </button>
          </div>

          <div className="grid gap-6 border-t border-black/10 px-4 py-6 md:grid-cols-[1fr_1.6fr] md:px-8">
            <h2 className="text-4xl font-bold leading-none">Work</h2>
            <p className="max-w-xl text-base leading-relaxed text-black/80 md:text-lg">
              We're a digital design studio that breaks predictable patterns. We focus on sharp visual language,
              modern interactions, and product pages built to convert.
            </p>
          </div>

          <div className="border-t border-black/10">
            {workItems.map((item) => (
              <article
                key={item.id}
                className="grid gap-4 border-b border-black/10 px-4 py-4 md:grid-cols-[80px_1.6fr_1fr_180px_160px] md:items-center md:px-8"
              >
                <p className="text-sm font-semibold">{item.id}</p>
                <p className="text-sm leading-relaxed text-black/80 md:text-base">{item.title}</p>
                <p className="text-sm font-semibold text-[#d62a2a] md:text-base">{item.client}</p>
                <img src={item.image} alt={item.client} className="h-20 w-full rounded-lg object-cover md:h-24" />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(item)}
                    className="rounded-md border border-black/20 px-3 py-1 text-xs font-semibold"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="rounded-md bg-black px-3 py-1 text-xs font-semibold text-white"
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-black/10 bg-white p-4">
            <h3 className="text-lg font-bold">Create Work Item</h3>
            <form className="mt-3 space-y-2" onSubmit={createForm.handleSubmit(handleCreate)}>
              <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Title" {...createForm.register('title')} />
              {createForm.formState.errors.title && <p className="text-xs text-rose-600">{createForm.formState.errors.title.message}</p>}

              <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Client" {...createForm.register('client')} />
              {createForm.formState.errors.client && <p className="text-xs text-rose-600">{createForm.formState.errors.client.message}</p>}

              <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Image URL" {...createForm.register('image')} />
              {createForm.formState.errors.image && <p className="text-xs text-rose-600">{createForm.formState.errors.image.message}</p>}

              <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm font-semibold text-white">
                Create
              </button>
            </form>
          </article>

          <article className="rounded-2xl border border-black/10 bg-white p-4">
            <h3 className="text-lg font-bold">Update Work Item</h3>
            {editingId ? (
              <form className="mt-3 space-y-2" onSubmit={editForm.handleSubmit(handleSaveEdit)}>
                <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Title" {...editForm.register('title')} />
                {editForm.formState.errors.title && <p className="text-xs text-rose-600">{editForm.formState.errors.title.message}</p>}

                <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Client" {...editForm.register('client')} />
                {editForm.formState.errors.client && <p className="text-xs text-rose-600">{editForm.formState.errors.client.message}</p>}

                <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Image URL" {...editForm.register('image')} />
                {editForm.formState.errors.image && <p className="text-xs text-rose-600">{editForm.formState.errors.image.message}</p>}

                <div className="flex gap-2">
                  <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm font-semibold text-white">
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-md border border-black/20 px-3 py-2 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <p className="mt-3 text-sm text-black/60">Select an item from the table and click Edit.</p>
            )}
          </article>
        </section>
      </main>

      <footer className="border-t border-black/10 bg-white/50 px-4 py-4 text-center text-xs text-black/60 md:px-8">
        <p>{year} Echo Studio. Crafted for responsive web and mini-app embedding.</p>
        <div className="mt-2 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() =>
              window.FlutterChannel?.postMessage(
                JSON.stringify({
                  source: 'react',
                  type: 'ping_from_react',
                  payload: { timestamp: Date.now() },
                }),
              )
            }
            className="rounded-md border border-black/20 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-black/70 hover:bg-black hover:text-white"
          >
            Send Ping To Flutter
          </button>
          <span className="text-[11px] text-black/50">From Flutter: {messageFromFlutter || 'none'}</span>
        </div>
      </footer>
    </div>
  );
}
