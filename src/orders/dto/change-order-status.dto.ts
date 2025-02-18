import { IsEnum, IsUUID } from "class-validator";
import { OrderStatusList } from "../enum";
import { OrderStatus } from "@prisma/client";

export class ChangeOrderStatusDto{
    
    @IsUUID()
    id:string

    @IsEnum(OrderStatusList,{message:`valid status are ${OrderStatusList}`})
    status:OrderStatus

}