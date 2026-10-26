import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { EducationService } from './education.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

function decodeJwtPayload(token: string): any {
  try {
    const base64Payload = token.split('.')[1];
    if (!base64Payload) return null;
    return JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

@Controller('education')
export class EducationController {
  constructor(private readonly educationService: EducationService) {}

  /**
   * GET /education/courses/:courseId/lectures
   * Public list of lectures in the course
   */
  @Get('courses/:courseId/lectures')
  getCourseLectures(@Param('courseId') courseId: string) {
    return this.educationService.getCourseLectures(courseId);
  }

  /**
   * GET /education/lectures/:lectureId/watch?course_id=...
   * Stream URL endpoint:
   * - Allows free lectures (class-01) for all
   * - Enforces enrollment check for paid lectures
   */
  @Get('lectures/:lectureId/watch')
  async watchLecture(
    @Param('lectureId') lectureId: string,
    @Query('course_id') courseId: string,
    @Req() req: Request,
  ) {
    // Extract userId from optional JWT Authorization header
    let userId: string | null = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const payload = decodeJwtPayload(token);
      userId = payload?.sub || payload?.userId || null;
    }

    return this.educationService.getLectureWatchUrl(userId, lectureId, courseId);
  }

  /**
   * POST /education/orders
   * Create course order for checkout
   */
  @UseGuards(JwtAuthGuard)
  @Post('orders')
  async createCourseOrder(
    @Req() req: any,
    @Body()
    body: {
      courseId: string;
      amount?: number;
      description?: string;
    },
  ) {
    const userId = req.user?.userId;
    return this.educationService.createCourseOrder(
      userId,
      body.courseId,
      body.amount || 999,
      body.description || 'TCBT Education Course',
    );
  }
}
