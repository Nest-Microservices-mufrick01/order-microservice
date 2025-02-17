import { IsEnum, IsOptional } from "class-validator";
import { OrderStatus } from "@prisma/client";
import { PaginationDto } from "src/common/dto";
import { OrderStatusList } from "../enum";

export class OrderPaginationDto extends PaginationDto{

    @IsOptional()
    @IsEnum(OrderStatusList,
        {
            message:`valid status are ${OrderStatusList}`
        }
    )
    status?: OrderStatus
}