import { Injectable } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { OrderFailedCommand } from './order-failed.command';
import { OrderStatus } from '../../models/order-status';

@Injectable()
@CommandHandler(OrderFailedCommand)
export class OrderFailedHandler
  implements ICommandHandler<OrderFailedCommand>
{
  constructor(private readonly elasticsearchService: ElasticsearchService) {}

  async execute(command: OrderFailedCommand) {
    const { orders: order } = command;
    
    return this.elasticsearchService.update({
      index: 'orders',
      refresh: 'wait_for',
      id: order.id,
      body: {
        doc: {
          id: order.id,
          service_id: order.serviceId,
          customer_id: order.customerId,
          customer_box_public_key: order.customerBoxPublicKey,
          seller_id: order.sellerId,
          dna_sample_tracking_id: order.dnaSampleTrackingId,
          currency: order.currency,
          prices: order.prices,
          additional_prices: order.additionalPrices,
          status: order.status,
          created_at: order.createdAt.toString(),
          updated_at: order.updatedAt.toString(),
          order_flow: order.orderFlow,
          blockMetaData: command.blockMetaData,
        },
      },
    }).catch((error) => {
      throw(error)
    });
  }
}