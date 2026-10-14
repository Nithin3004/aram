import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Readable } from 'stream';

/** S3-compatible object storage (MinIO locally) for delivery photos. */
@Injectable()
export class StorageService implements OnModuleInit {
  private log = new Logger('Storage');
  private bucket = process.env.S3_BUCKET ?? 'aram-photos';
  private s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? '', secretAccessKey: process.env.S3_SECRET_KEY ?? '' },
  });

  async onModuleInit() {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.log.log(`Created bucket ${this.bucket}`);
      } catch (e) {
        this.log.warn(`Object storage unavailable: ${(e as Error).message}`);
      }
    }
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async get(key: string) {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return { body: r.Body as Readable, contentType: r.ContentType ?? 'image/jpeg' };
  }
}
