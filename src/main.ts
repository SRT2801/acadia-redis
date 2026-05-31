import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { RedisMicroserviceModule } from './redis/redis-microservice.module';
import { RedisService } from './redis/redis.service';

async function bootstrap() {
  const app = await NestFactory.create(RedisMicroserviceModule);
  app.enableCors({
    origin: '*',
    credentials: true,
  });
  const configService = app.get(ConfigService);
  const port = configService.get<number>('HTTP_PORT', 4001);

  await app.listen(port);
  console.log(`Redis microservice running on port ${port}`);

  const redisService = app.get(RedisService);
  await redisService.ping();
}

bootstrap();