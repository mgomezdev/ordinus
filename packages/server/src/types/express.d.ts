declare namespace Express {
  interface Request {
    requestId: string;
    user?: {
      userId: number;
      role: string;
    };
  }
}
