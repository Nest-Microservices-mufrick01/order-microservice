import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OrderItem, PrismaClient } from '@prisma/client';
import { CreateOrderDto } from './dto/create-order.dto';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto } from './dto';
import { PRODUCT_SERVICE } from 'src/config';
import { catchError, firstValueFrom } from 'rxjs';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {

  constructor( @Inject(PRODUCT_SERVICE) private readonly productsClient: ClientProxy){
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
      const productDetails:any[] = await firstValueFrom( this.productsClient.send({cmd:'validate_products'},productsIds))

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
