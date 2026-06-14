import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ClsMiddleware } from 'nestjs-cls';
import * as path from 'path';
import './utils/moment-mysql';
import { AppModule } from './modules/App/App.module';
import { NestExpressApplication } from '@nestjs/platform-express';

global.__public_dirname = path.join(__dirname, '..', 'public');
global.__static_dirname = path.join(__dirname, '../static');
global.__views_dirname = path.join(global.__static_dirname, '/views');
global.__images_dirname = path.join(global.__static_dirname, '/images');

async function bootstrap() {
  // Fail fast: the API server must never serve auth with a missing/insecure JWT
  // signing key (the old `|| '123123'` fallback was a forge-any-token bypass).
  // This guard lives here, not in the jwt config factory, so the migration/CLI
  // entrypoint — which has no JWT secret in its env and never signs tokens — is
  // unaffected.
  if (!process.env.APP_JWT_SECRET && !process.env.JWT_SECRET) {
    throw new Error(
      'JWT signing secret is not set. Set APP_JWT_SECRET (or JWT_SECRET) before ' +
        'starting the API server. Refusing to start with an insecure default key.',
    );
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.set('query parser', 'extended');
  app.setGlobalPrefix('/api');

  // create and mount the middleware manually here
  app.use(new ClsMiddleware({}).use);

  const config = new DocumentBuilder()
    .setTitle('Bigcapital')
    .setDescription('Financial accounting software')
    .setVersion('1.0')
    .build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, documentFactory);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
