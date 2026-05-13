
export type Side = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderStatus = "open" | "partially_filled" | "filled" | "cancelled";

export interface Balance {
  available: number;
  locked: number;
}

export interface RestingOrder {
  orderId: string;
  userId: string;
  side: Side;
  type: "limit";
  symbol: string;
  price: number;
  qty: number;
  filledQty: number;
  status: OrderStatus;
  createdAt: number;
}

export interface OrderRecord {
  orderId: string;
  userId: string;
  side: Side;
  type: OrderType;
  symbol: string;
  price: number | null;
  qty: number;
  filledQty: number;
  status: OrderStatus;
  fills: Fill[];
  createdAt: number;
}

export interface Fill {
  fillId: string;
  symbol: string;
  price: number;
  qty: number;
  buyOrderId: string;
  sellOrderId: string;
  createdAt: number;
}

export interface OrderBook {
  bids: Map<number, RestingOrder[]>;
  asks: Map<number, RestingOrder[]>;
}

export interface CreateOrderInput {
  userId: string;
  type: OrderType;
  side: Side;
  symbol: string;
  price: number | null;
  qty: number;
}

export interface DepthLevel {
  price: number;
  qty: number;
}

export interface DepthResponse {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
}

export const BALANCES = new Map<string, Record<string, Balance>>();
export const ORDERBOOKS = new Map<string, OrderBook>();
export const ORDERS = new Map<string, OrderRecord>();
export const FILLS: Fill[] = [];

function seedUserIfNeeded(userId: string) {
  if(!BALANCES.has(userId)) {
    BALANCES.set(userId,{
      USD: { available: 100000, locked: 0},
      BTC: { available: 50, locked: 50}
    })
  }
}

export function getBalance(userId: string) {
  if(!BALANCES.has(userId)) {
    seedUserIfNeeded(userId)
  }
  return BALANCES.get(userId);
}

export function getDepth(symbol: string) : DepthResponse {
  const book = ORDERBOOKS.get(symbol);
  if(!book) {
    return { symbol, bids: [], asks: [] }
  }

  const bids = [...book.bids.entries()].sort((a,b) => b[0] - a[0]).map(([price, orders]) => ({
      price,
      qty: orders.reduce((sum, o) => sum + (o.qty - o.filledQty), 0)
  }));

  const asks = [...book.asks.entries()].sort((a,b) => a[0] - b[0]).map(([price, orders]) => ({
    price,
    qty: orders.reduce((sum, o) => sum + (o.qty - o.filledQty), 0)
  }));

  return{
    symbol,
    bids,
    asks
  }
}

export function getOrder(payload: Record<string, unknown>) {
  const orderId = payload.orderId as string;
  const order = ORDERS.get(orderId);
  if(!order) {
    throw new Error("Order not found");
  }
  return order;
}

export function createOrder(payload: Record<string, unknown>) {
  const userId = payload.userId as string;
  const side = payload.side as Side;
  const type = payload.type as OrderType;
  const symbol = payload.symbol as string;
  const price = payload.price as number | null;
  const qty = payload.qty as number;

  seedUserIfNeeded(userId);

  if(!ORDERBOOKS.has(symbol)) {
    ORDERBOOKS.set( symbol, { bids: new Map(), asks: new Map()})
  }

  const order: OrderRecord = {
    orderId: crypto.randomUUID(),
    userId,
    side,
    type,
    symbol,
    price,
    qty,
    filledQty: 0,
    status: "open",
    fills: [],
    createdAt: Date.now(),
  }

  ORDERS.set(order.orderId, order);

  const book = ORDERBOOKS.get(symbol)!; 
  const oppoSide = order.side === 'buy' ? book?.asks : book?.bids;

  while(order.filledQty < qty) {
    const remaining = order.qty - order.filledQty;
    const prices = [...oppoSide.keys()];
    if(prices.length == 0) break;

    const bestPrice = order.side === "buy" ? Math.min(...prices) : Math.max(...prices);

    if(order.type == "limit") {
      if(side == 'buy' && price! < bestPrice) break;
      if(side == 'sell' && price! > bestPrice) break;
    }

    const level = oppoSide.get(bestPrice)!;
    const resting = level[0]!;

    const restingRemaining = resting.qty - resting.filledQty;
    const fillQty = Math.min( remaining, restingRemaining);

    const fill: Fill = {
      fillId: crypto.randomUUID(),
      symbol,
      price: bestPrice,
      buyOrderId: side === 'buy' ? order.orderId : resting?.orderId,
      sellOrderId: side == 'sell' ? order.orderId : resting?.orderId,
      createdAt: Date.now(),
      qty: fillQty
    };
    order.fills.push(fill);

    order.filledQty += fillQty;
    resting.filledQty += fillQty;

    const restingRecords = ORDERS.get(resting?.orderId)!;
    restingRecords.fills.push(fill);
    restingRecords.filledQty += fillQty;
    restingRecords.status = restingRecords.filledQty == restingRecords.qty ? 'filled' : 'partially_filled';

    FILLS.push(fill);

    if(restingRecords.status == 'filled') {
      level.shift();
      if(level.length == 0) {
        oppoSide?.delete(bestPrice);
      }
    }
  }
  order.status = order.filledQty === 0? 'open' : order.filledQty < order.qty ? 'partially_filled' : 'filled';

    if(type == "limit" && order.filledQty < order.qty) {
      
      const restingOrder: RestingOrder =  {
        orderId: order.orderId,
        userId: order.userId,
        side: order.side,
        qty: order.qty,
        filledQty: order.filledQty,
        symbol,
        type: 'limit',
        status: order.status,
        price: price!,
        createdAt: Date.now()
      }

      const mySide = order.side === "buy" ? book?.bids : book?.asks;
      if(!mySide.has(price!)) mySide.set(price!, []);
      mySide.get(price!)!.push(restingOrder);
    }

    return {
      orderId:   order.orderId,
      status:    order.status,
      filledQty: order.filledQty,
      fills:     order.fills,
    };
}


