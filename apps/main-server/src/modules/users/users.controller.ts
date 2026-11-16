import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Delete,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { AddAddressDto } from './dto/add-address.dto';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post('enroll')
  enrollCourse(
    @Body()
    body: {
      mobile_number?: string;
      user_id?: string;
      course_id: string;
    },
  ) {
    const target = body.mobile_number || body.user_id || '';
    return this.usersService.enrollCourse(target, body.course_id);
  }

  @Post('enroll-batch')
  async enrollBatch(
    @Body()
    body: {
      mobile_numbers: string[];
      course_id?: string;
    },
  ) {
    const courseId = body.course_id || 'tcbt-organic-farming-101';
    const numbers = body.mobile_numbers || [];
    const results: any[] = [];

    for (const mobile of numbers) {
      try {
        const res = await this.usersService.enrollCourse(mobile, courseId);
        results.push({ mobile, success: res.success, message: res.message });
      } catch (err: any) {
        results.push({ mobile, success: false, error: err.message });
      }
    }

    return { total: results.length, courseId, results };
  }

  @Get(':id/courses')
  getUserCourses(@Param('id') id: string) {
    return this.usersService.getUserEnrolledCourses(id);
  }

  @Get(':id')
  getUser(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  updateUser(@Param('id') id: string, @Body() body: any) {
    return this.usersService.updateUser(id, body);
  }

  @Patch(':id/address')
  addAddress(@Param('id') id: string, @Body() body: AddAddressDto) {
    return this.usersService.addAddress(id, body);
  }

  @Patch(':id/address/:addressId')
  updateUserAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Body() body: Partial<AddAddressDto>,
  ) {
    return this.usersService.updateAddress(id, addressId, body);
  }

  @Get(':id/address')
  getUserAddresses(@Param('id') id: string) {
    return this.usersService.findAddressesByUserId(id);
  }

  @Get(':id/address/:addressId')
  getUserAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
  ) {
    return this.usersService.findAddressById(id, addressId);
  }

  @Delete(':id/address/:addressId')
  deleteUserAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
  ) {
    return this.usersService.deleteAddress(id, addressId);
  }
}
