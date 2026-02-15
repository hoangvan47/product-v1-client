import { z } from 'zod';

export const workItemCreateSchema = z.object({
  title: z.string().min(8, 'Title must have at least 8 characters').max(140, 'Title is too long'),
  client: z.string().min(2, 'Client is required').max(80, 'Client name is too long'),
  image: z.string().url('Image must be a valid URL'),
});

export type WorkItemFormValues = z.infer<typeof workItemCreateSchema>;

export type WorkItem = WorkItemFormValues & {
  id: string;
};

