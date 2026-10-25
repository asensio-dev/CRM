import { Injectable } from '@nestjs/common';
import type { Clock } from '../../application';

@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
