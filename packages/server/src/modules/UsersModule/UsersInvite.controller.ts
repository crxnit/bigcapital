import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersApplication } from './Users.application';
import { SendInviteUserDto } from './dtos/InviteUser.dto';
import { RequirePermission } from '@/modules/Roles/RequirePermission.decorator';
import { PermissionGuard } from '@/modules/Roles/Permission.guard';
import { AuthorizationGuard } from '@/modules/Roles/Authorization.guard';
import { AbilitySubject, AdminAction } from '@/modules/Roles/Roles.types';

@Controller('invite')
@ApiTags('Users')
@UseGuards(AuthorizationGuard, PermissionGuard)
export class UsersInviteController {
  constructor(private readonly usersApplication: UsersApplication) {}

  /**
   * Send an invitation to a new user.
   */
  @Patch()
  @RequirePermission(AdminAction.Manage, AbilitySubject.User)
  @ApiOperation({ summary: 'Send an invitation to a new user.' })
  async sendInvite(@Body() sendInviteDTO: SendInviteUserDto) {
    const result = await this.usersApplication.sendInvite(sendInviteDTO);

    return {
      invitedUser: result.invitedUser,
      message: 'The invitation has been sent successfully.',
    };
  }

  /**
   * Resend an invitation to an existing user.
   */
  @Post('users/:id/resend')
  @RequirePermission(AdminAction.Manage, AbilitySubject.User)
  @ApiOperation({ summary: 'Resend an invitation to an existing user.' })
  async resendInvite(@Param('id') userId: number) {
    const result = await this.usersApplication.resendInvite(userId);

    return {
      user: result.user,
      message: 'The invitation has been resent successfully.',
    };
  }
}
