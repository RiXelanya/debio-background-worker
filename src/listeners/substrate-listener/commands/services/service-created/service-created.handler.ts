import { Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  DateTimeProxy,
  LabRegister,
  labToLabRegister,
  MailerManager,
  NotificationService,
  SubstrateService,
} from '@common/index';
import { Lab, queryLabById, Service } from '@debionetwork/polkadot-provider';
import { ServiceCreatedCommand } from './service-created.command';
import { NotificationDto } from '@common/notification/dto/notification.dto';
import { GCloudSecretManagerService } from '@debionetwork/nestjs-gcloud-secret-manager';
import { keyList } from '@common/secrets';

@Injectable()
@CommandHandler(ServiceCreatedCommand)
export class ServiceCreatedHandler
  implements ICommandHandler<ServiceCreatedCommand>
{
  private readonly logger: Logger = new Logger(ServiceCreatedCommand.name);
  constructor(
    private readonly gCloudSecretManagerService: GCloudSecretManagerService<keyList>,
    private readonly notificationService: NotificationService,
    private readonly substrateService: SubstrateService,
    private readonly mailerManager: MailerManager,
    private readonly dateTimeProxy: DateTimeProxy,
  ) {}

  async execute(command: ServiceCreatedCommand) {
    const service: Service = command.services;
    const blockNumber = command.blockMetaData.blockNumber.toString();
    this.logger.log(
      `Lab ID: ${service.ownerId} Service Created With ID: ${service.id}`,
    );
    const lab: Lab = await queryLabById(
      this.substrateService.api as any,
      service.ownerId,
    );

    if (lab.verificationStatus === 'Unverified' && lab.services.length === 1) {
      // Send email for unverified accounts only (until further notice)
      const labRegister: LabRegister = await labToLabRegister(
        this.substrateService.api,
        lab,
      );
      this.mailerManager.sendLabRegistrationEmail(
        this.gCloudSecretManagerService.getSecret('EMAILS').split(','),
        labRegister,
      );
    }

    const currDateTime = this.dateTimeProxy.new();

    // insert notification
    const notificationInput: NotificationDto = {
      role: 'Lab',
      entity_type: 'Lab',
      entity: 'Add service',
      reference_id: service.info.name,
      description: `You've successfully added your new service - [].`,
      read: false,
      created_at: currDateTime,
      updated_at: currDateTime,
      deleted_at: null,
      from: 'Debio Network',
      to: service.ownerId,
      block_number: blockNumber,
    };

    await this.notificationService.insert(notificationInput);
  }
}
