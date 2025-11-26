import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
    logger: ['error', 'warn'],
  });

  const isProd = process.env.NODE_ENV === 'production';
  const port = isProd ? 4997 : 4997;
  //const host = '192.168.1.169';
  const host = '192.168.0.169';

  await app.listen(port, host, () => {
    console.log('\x1b[32m%s\x1b[0m', `✅ Server running on IP ${host} and listening on port ${port} (${isProd ? 'PROD' : 'DEV'})`);
  });
}

bootstrap();
