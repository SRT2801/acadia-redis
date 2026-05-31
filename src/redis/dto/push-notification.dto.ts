import { IsString, IsNumber, IsOptional, IsIn, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NotificationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty()
  @IsString()
  @IsIn(['MESSAGE', 'ANNOUNCEMENT', 'MENTION', 'INVITATION'])
  type: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  senderId?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  senderName?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  channelId?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  channelName?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  courseId?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  link?: string;

  @ApiProperty()
  @IsNotEmpty()
  isRead: boolean;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  createdAt: string;
}

export class PushNotificationDto {
  @ApiProperty()
  @IsNumber()
  userId: number;

  @ApiProperty({ type: NotificationDto })
  @IsNotEmpty()
  notification: NotificationDto;
}
