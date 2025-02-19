import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateOrderDto } from './dto/create-order.dto';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto } from './dto';
import { NATS_SERVICE } from 'src/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {

  constructor( @Inject(NATS_SERVICE) private readonly natsClient: ClientProxy){
    super();
  }

  private readonly logger = new Logger('Order-Service')

  async onModuleInit() {
    await this.$connect();
    this.logger.log(`Database connected`)
  }


  async create(createOrderDto: CreateOrderDto) {

    try {
      // 1. confirmar los ids de los productos
      const productsIds = createOrderDto.items.map(item=>item.productId);
      const productDetails:any[] = await firstValueFrom( this.natsClient.send({cmd:'validate_products'},productsIds))

      // 2. calcular valores
      const totalAmount = createOrderDto.items.reduce((acc,orderItem)=>{
        const price = productDetails.find(product=>product.id  === orderItem.productId).price;

        return acc + (price * orderItem.quantity)
        
      },0);

      const totalItems = createOrderDto.items.reduce((acc,orderItem)=>{
        return acc + orderItem.quantity
      },0)

      // transaction
      const order = await this.order.create({
        data:{
          totalAmount,
          totalItems,
          orderItem:{
            createMany:{
              data:createOrderDto.items.map(orderItem=>{
                return{
                  productId:orderItem.productId,
                  quantity:orderItem.quantity,
                  price:productDetails.find(product => product.id === orderItem.productId).price,
                }
              })
            }
          }
        },
        include:{
          orderItem:{
            select:{
              productId: true,
              price:true,
              quantity:true,
            }
          }
        }
      })



      return {
        ...order,
        orderItem: order.orderItem.map(orderItem=>({
          name: productDetails.find(product => product.id === orderItem.productId).name,
          ...orderItem,
        }))
      }
    } catch (error) {
      throw new RpcException(error)
    }
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
   
    const order = await this.order.findFirst(
      {
        where:{id},
        include:{
          orderItem:{
            select:{
              productId:true,
              quantity:true,
              price:true
            }
          }
        }
      },
      
    )

    if(!order){
      throw new RpcException({
        status:HttpStatus.NOT_FOUND,
        message:`order with id ${id} not found`
      })
    }

    const productsIds = order.orderItem.map(item => item.productId);
    let productsDetail:any[];
    try {
      productsDetail = await firstValueFrom(this.natsClient.send({cmd:'validate_products'},productsIds))
    } catch (error) {
      throw new RpcException({
        status:HttpStatus.NOT_FOUND,
        message:`some item in order is not found`
      })
    }
    
    return {
      ...order,
      orderItem: order.orderItem.map(
        orderItem=>({
          name: productsDetail.find(product => product.id === orderItem.productId).name,
          ... orderItem
        })
      )
    }
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
