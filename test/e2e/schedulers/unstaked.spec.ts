import 'regenerator-runtime/runtime';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import {
  ProcessEnvModule,
  SubstrateModule,
  SubstrateService,
} from '@common/index';
import {
  ElasticsearchModule,
  ElasticsearchService,
} from '@nestjs/elasticsearch';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { UnstakedService } from '@schedulers/unstaked/unstaked.service';
import * as serviceRequestQuery from '@debionetwork/polkadot-provider/lib/query/service-request';
import { ServiceRequest } from '@debionetwork/polkadot-provider';
import {
  GCloudSecretManagerModule,
  GCloudSecretManagerService,
} from '@debionetwork/nestjs-gcloud-secret-manager';
import { SecretKeyList, keyList } from '@common/secrets';

describe('Unstaked Scheduler (e2e)', () => {
  let schedulerRegistry: SchedulerRegistry;
  let unstakedService: UnstakedService;
  let substrateService: SubstrateService;
  let gCloudSecretManagerService: GCloudSecretManagerService<keyList>;
  let elasticsearchService: ElasticsearchService;

  let app: INestApplication;

  class GoogleSecretManagerServiceMock {
    _secretsList = new Map<string, string>([
      ['SUBSTRATE_URL', process.env.SUBSTRATE_URL],
      ['ELASTICSEARCH_USERNAME', process.env.ELASTICSEARCH_USERNAME],
      ['ELASTICSEARCH_PASSWORD', process.env.ELASTICSEARCH_PASSWORD],
      ['ADMIN_SUBSTRATE_MNEMONIC', process.env.ADMIN_SUBSTRATE_MNEMONIC],
      ['UNSTAKE_TIMER', process.env.UNSTAKE_TIMER],
      ['UNSTAKE_INTERVAL', process.env.UNSTAKE_INTERVAL],
    ]);
    loadSecrets() {
      return null;
    }

    getSecret(key) {
      return this._secretsList.get(key);
    }
  }

  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        GCloudSecretManagerModule.withConfig(
          process.env.GCS_PARENT,
          SecretKeyList,
        ),
        ElasticsearchModule.registerAsync({
          inject: [GCloudSecretManagerService],
          useFactory: async (
            gCloudSecretManagerService: GCloudSecretManagerService<keyList>,
          ) => ({
            node: process.env.ELASTICSEARCH_NODE,
            auth: {
              username: gCloudSecretManagerService
                .getSecret('ELASTICSEARCH_USERNAME')
                .toString(),
              password: gCloudSecretManagerService
                .getSecret('ELASTICSEARCH_PASSWORD')
                .toString(),
            },
          }),
        }),
        ProcessEnvModule,
        SubstrateModule,
        ScheduleModule.forRoot(),
      ],
    })
      .overrideProvider(GCloudSecretManagerService)
      .useClass(GoogleSecretManagerServiceMock)
      .compile();

    schedulerRegistry = module.get(SchedulerRegistry);
    substrateService = module.get(SubstrateService);
    gCloudSecretManagerService = module.get(GCloudSecretManagerService);
    elasticsearchService = module.get(ElasticsearchService);

    unstakedService = new UnstakedService(
      gCloudSecretManagerService,
      elasticsearchService,
      substrateService,
      schedulerRegistry,
    );

    app = module.createNestApplication();
    await app.init();
  }, 50000);

  afterAll(async () => {
    await substrateService.stopListen();
    substrateService.destroy();
  }, 12000);

  it('unstaked-interval must registered', async () => {
    unstakedService.onModuleInit();

    expect(
      schedulerRegistry.doesExists('interval', 'unstaked-interval'),
    ).toBeTruthy();

    clearInterval(schedulerRegistry.getInterval('unstaked-interval'));
  });

  it('handleWaitingUnstaked should not throw error', async () => {
    // Arrange
    const queryServiceRequestByIdSpy = jest.spyOn(
      serviceRequestQuery,
      'queryServiceRequestById',
    );
    const RESULT: ServiceRequest = new ServiceRequest({
      hash_:
        '0x8b48ead7cf44e6449cbb5de298f3c3915f09b700b7a74b27a368c69629884155',
      requesterAddress: '5GH6Kqaz3ZewWvDCZPkTnsRezUf2Q7zZ5GmC4XFLNqKdVwA7',
      labAddress: null,
      country: 'ID',
      region: 'Kota Administrasi Jakarta Barat',
      city: 'JK',
      serviceCategory: 'SNP Microarray',
      stakingAmount: '5,000,000,000,000,000,000',
      status: 'WaitingForUnstaked',
      createdAt: '1,648,627,710,001',
      updatedAt: '1,648,627,710,001',
      unstakedAt: '1,648,627,710,001',
    });
    queryServiceRequestByIdSpy.mockImplementation(() =>
      Promise.resolve(RESULT),
    );

    // Act
    await unstakedService.handleWaitingUnstaked();

    // Assert
    expect(queryServiceRequestByIdSpy).toBeCalledTimes(1);
  }, 12000);
});
