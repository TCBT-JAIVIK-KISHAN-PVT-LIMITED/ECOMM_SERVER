import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequestUser } from './jwt.strategy';

export const CurrentUser = createParamDecorator(
  (
    _data: unknown,
    ctx: ExecutionContext,
  ): AuthenticatedRequestUser | undefined => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedRequestUser }>();
    return req.user;
  },
);
