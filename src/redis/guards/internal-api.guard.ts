import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";

@Injectable()
export class InternalApiGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers["x-internal-api-key"];

    const validKey = this.configService.get<string>("INTERNAL_API_KEY");

    if (!apiKey || apiKey !== validKey) {
      throw new UnauthorizedException("Invalid internal API key");
    }

    return true;
  }
}
