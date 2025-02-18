import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateOrderDto } from './dto/create-order.dto';
import { RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto } from './dto';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {

  private readonly logger = new Logger('Order-Service')

  async onModuleInit() {
    await this.$connect();
    this.logger.log(`Database connected`)
  }


  async create(createOrderDto: CreateOrderDto) {

    return {
      service: 'create order',
      createOrderDto
    }

    // try {
    //   return await this.order.create({data:createOrderDto});
    // } catch (error) {
    //   throw new RpcException(error)
    // }
  }

  async findAll(orderPaginationDto:OrderPaginationDto) {
    const {limit,page,status} = orderPaginationDto

    const totalOrders = await this.order.count({where:{status}});
    const lastPage = Math.ceil(totalOrders/limit);

    const orders = await this.order.findMany({
      where:{status},
      take:limit,
      skip:(page-1)*limit
    })


    return{
      meta:{
        page,
        status,
        totalOrders,
        lastPage
      },
      data:orders
    }
  }

  async findOne(id: string) {
   
    const order = await this.order.findFirst({where:{id}})
    if(!order){
      throw new RpcException({
        status:HttpStatus.NOT_FOUND,
        message:`order with id ${id} not found`
      })
    }
    return order;
  }

  async changeOrderStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const {id,status} = changeOrderStatusDto;

    const order = await this.findOne(id);

    if(order.status === status){
      return order;
    }

    try {
      return await this.order.update({where:{id},data:{status}})
    } catch (error) {
      throw new RpcException({
        status:HttpStatus.NOT_FOUND,
        message:`order with id ${id} not found`
      })
    }

  }
}
