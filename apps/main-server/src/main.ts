import './instrumentation';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // ✅ Disable default parser (IMPORTANT)
  });

  // 🌍 CORS — must be registered BEFORE helmet
  app.enableCors({
    origin: [
      'https://tcbtjaivikkisan.com',
      'https://www.tcbtjaivikkisan.com',
      'https://admin.tcbtjaivikkisan.com',
      'https://api.tcbtjaivikkisan.com',
      'http://localhost:3000',
      'http://localhost:3001',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // 🔐 Security — crossOriginResourcePolicy set to 'cross-origin' so
  //   browser can fetch resources (images, fonts) across origins
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // ✅ Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 📄 Swagger — only available in non-production
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('TCBT API')
      .setDescription('Interactive API documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document);
  }

  // 🔥 CRITICAL: RAW BODY for Zoho webhook ONLY
  app.use('/payments/webhook', bodyParser.raw({ type: '*/*' }));

  // ✅ Normal JSON parser for all other routes
  app.use(bodyParser.json());

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
}

bootstrap();
