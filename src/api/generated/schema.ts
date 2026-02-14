export type paths = {
  '/products': {
    get: {
      responses: {
        200: {
          content: {
            'application/json': Array<{
              id: number;
              title: string;
              description: string;
              price: number;
              imageUrl: string;
            }>;
          };
        };
      };
    };
  };
};
