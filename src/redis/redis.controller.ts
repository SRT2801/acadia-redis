import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "./redis.service";
import { NotificationsGateway } from "./notifications.gateway";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { InternalApiGuard } from "./guards/internal-api.guard";
import { PushNotificationDto } from "./dto/push-notification.dto";

@ApiTags("Redis Notifications")
@Controller("notifications")
export class RedisController {
  constructor(
    private readonly redisService: RedisService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly configService: ConfigService,
  ) {}

  @Post("internal/push")
  @UseGuards(InternalApiGuard)
  @ApiOperation({
    summary: "Internal push notification (for backend services)",
  })
  @ApiResponse({ status: 201, description: "Notification pushed" })
  async pushNotificationInternal(@Body() pushDto: PushNotificationDto) {
    try {
      const { userId, notification } = pushDto;

      if (!notification.id) {
        notification.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }

      await this.redisService.addNotification(userId, notification);
      await this.redisService.incrementUnreadCount(userId);

      const unreadCount = await this.redisService.getUnreadCount(userId);
      this.notificationsGateway.emitNotification(userId, {
        ...notification,
        unreadCount,
      });

      return { success: true, notification };
    } catch (error) {
      throw error;
    }
  }

  @Get("internal/:userId")
  @UseGuards(InternalApiGuard)
  @ApiOperation({ summary: "Internal get user notifications" })
  @ApiResponse({ status: 200, description: "Notifications list" })
  async getNotificationsInternal(@Param("userId") userId: string, @Req() req: any) {
    const limit = parseInt(req.query.limit || "50", 10);
    const notifications = await this.redisService.getNotifications(
      parseInt(userId, 10),
      limit,
    );
    return { notifications, total: notifications.length };
  }

  @Get("internal/:userId/unread-count")
  @UseGuards(InternalApiGuard)
  @ApiOperation({ summary: "Internal get unread notification count" })
  @ApiResponse({ status: 200, description: "Unread count" })
  async getUnreadCountInternal(@Param("userId") userId: string) {
    const count = await this.redisService.getUnreadCount(parseInt(userId, 10));
    return { count };
  }

  @Patch("internal/:userId/read/:notificationId")
  @UseGuards(InternalApiGuard)
  @ApiOperation({ summary: "Internal mark notification as read" })
  @ApiResponse({ status: 200, description: "Notification marked as read" })
  async markAsReadInternal(
    @Param("userId") userId: string,
    @Param("notificationId") notificationId: string,
  ) {
    const userIdNum = parseInt(userId, 10);
    await this.redisService.markNotificationAsRead(userIdNum, notificationId);
    await this.redisService.decrementUnreadCount(userIdNum);
    return { success: true };
  }

  @Patch("internal/:userId/read-all")
  @UseGuards(InternalApiGuard)
  @ApiOperation({ summary: "Internal mark all notifications as read" })
  @ApiResponse({ status: 200, description: "All marked as read" })
  async markAllAsReadInternal(@Param("userId") userId: string) {
    const userIdNum = parseInt(userId, 10);
    const notifications = await this.redisService.getNotifications(userIdNum, 100);

    for (const notification of notifications) {
      if (!notification.isRead) {
        await this.redisService.markNotificationAsRead(userIdNum, notification.id);
      }
    }

    await this.redisService.resetUnreadCount(userIdNum);
    return { success: true };
  }

  @Patch("internal/:userId/channel/:channelId/read")
  @UseGuards(InternalApiGuard)
  @ApiOperation({ summary: "Internal mark channel notifications as read" })
  @ApiResponse({ status: 200, description: "Channel notifications marked as read" })
  async markChannelAsReadInternal(
    @Param("userId") userId: string,
    @Param("channelId") channelId: string,
  ) {
    await this.redisService.markChannelNotificationsAsRead(
      parseInt(userId, 10),
      parseInt(channelId, 10),
    );
    return { success: true };
  }

  @Post("push")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Push notification to Redis and emit via WebSocket",
  })
  @ApiResponse({ status: 201, description: "Notification pushed" })
  async pushNotification(@Body() pushDto: PushNotificationDto) {
    const { userId, notification } = pushDto;

    if (!notification.id) {
      notification.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    await this.redisService.addNotification(userId, notification);
    await this.redisService.incrementUnreadCount(userId);

    const unreadCount = await this.redisService.getUnreadCount(userId);
    this.notificationsGateway.emitNotification(userId, {
      ...notification,
      unreadCount,
    });

    return { success: true };
  }

  @Get("unread-count/:userId")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get unread notification count" })
  @ApiResponse({ status: 200, description: "Unread count" })
  async getUnreadCount(@Param("userId") userId: string) {
    const count = await this.redisService.getUnreadCount(parseInt(userId, 10));
    return { count };
  }

  @Patch("unread-count/:userId/reset")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Reset unread count" })
  @ApiResponse({ status: 200, description: "Count reset" })
  async resetUnreadCount(@Param("userId") userId: string) {
    await this.redisService.resetUnreadCount(parseInt(userId, 10));
    return { success: true };
  }

  @Get(":userId")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get user notifications from Redis" })
  @ApiResponse({ status: 200, description: "Notifications list" })
  async getNotifications(@Param("userId") userId: string, @Req() req: any) {
    const limit = parseInt(req.query.limit || "50", 10);
    const notifications = await this.redisService.getNotifications(
      parseInt(userId, 10),
      limit,
    );
    return notifications;
  }

  @Patch(":userId/read/:notificationId")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Mark notification as read" })
  @ApiResponse({ status: 200, description: "Notification marked as read" })
  async markAsRead(
    @Param("userId") userId: string,
    @Param("notificationId") notificationId: string,
  ) {
    const userIdNum = parseInt(userId, 10);
    await this.redisService.markNotificationAsRead(userIdNum, notificationId);
    await this.redisService.decrementUnreadCount(userIdNum);
    return { success: true };
  }

  @Patch(":userId/read-all")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Mark all notifications as read" })
  @ApiResponse({ status: 200, description: "All marked as read" })
  async markAllAsRead(@Param("userId") userId: string) {
    const userIdNum = parseInt(userId, 10);
    const notifications = await this.redisService.getNotifications(userIdNum, 100);

    for (const notification of notifications) {
      if (!notification.isRead) {
        await this.redisService.markNotificationAsRead(userIdNum, notification.id);
      }
    }

    await this.redisService.resetUnreadCount(userIdNum);
    return { success: true };
  }

  @Patch(":userId/channel/:channelId/read")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Mark channel notifications as read" })
  @ApiResponse({
    status: 200,
    description: "Channel notifications marked as read",
  })
  async markChannelAsRead(
    @Param("userId") userId: string,
    @Param("channelId") channelId: string,
  ) {
    await this.redisService.markChannelNotificationsAsRead(
      parseInt(userId, 10),
      parseInt(channelId, 10),
    );
    return { success: true };
  }
}
