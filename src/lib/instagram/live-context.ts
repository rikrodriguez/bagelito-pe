import { flavors } from "@/data/flavors";
import { packs } from "@/data/packs";
import { isBatchAcceptingOrders } from "@/lib/batch-availability";
import { districtOptions, getDeliveryFee } from "@/lib/delivery-pricing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type InstagramLiveContextRequest = {
  district?: string | null;
  orderCode?: string | null;
};

type SafeBatch = {
  id: string;
  name: string;
  status: string;
  acceptingOrders: boolean;
  ordersOpenAt: string | null;
  ordersCloseAt: string | null;
  deliveryDate: string | null;
};

type SafeOrder = {
  orderCode: string;
  packName: string;
  packUnits: number;
  status: string;
  paymentStatus: string | null;
  deliveryDistrict: string;
  deliveryDate: string | null;
  items: Array<{ flavor: string; quantity: number }>;
};

export type InstagramLiveContext = {
  generatedAt: string;
  catalog: {
    flavors: Array<{
      slug: string;
      name: string;
      category: string;
      price: number;
      seasonal: boolean;
    }>;
    packs: Array<{
      slug: string;
      name: string;
      units: number;
      amount: number;
      packType: string;
    }>;
  };
  batch: SafeBatch | null;
  delivery: { district: string; fee: number } | null;
  order: SafeOrder | null;
  warnings: string[];
};

function isMissingTable(error: { code?: string; message?: string } | null, table: string) {
  if (!error) return false;
  return error.code === "42P01" || (error.message ?? "").toLowerCase().includes(table.toLowerCase());
}

export async function getInstagramLiveContext(
  request: InstagramLiveContextRequest = {},
): Promise<InstagramLiveContext> {
  const supabase = createSupabaseAdminClient();
  const warnings: string[] = [];

  let batch: SafeBatch | null = null;
  const { data: batchRow, error: batchError } = await supabase
    .from("batches")
    .select("id,name,status,orders_open_at,orders_close_at,delivery_date")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (batchError) {
    if (isMissingTable(batchError, "batches")) {
      warnings.push("batch_source_unavailable");
    } else {
      warnings.push(`batch_lookup_failed:${batchError.code ?? "unknown"}`);
    }
  } else if (batchRow) {
    batch = {
      id: batchRow.id,
      name: batchRow.name,
      status: batchRow.status,
      acceptingOrders: isBatchAcceptingOrders(batchRow.status, batchRow.orders_close_at),
      ordersOpenAt: batchRow.orders_open_at,
      ordersCloseAt: batchRow.orders_close_at,
      deliveryDate: batchRow.delivery_date,
    };
  }

  let order: SafeOrder | null = null;
  const orderCode = request.orderCode?.trim();

  if (orderCode) {
    const { data: orderRow, error: orderError } = await supabase
      .from("orders")
      .select("order_code,pack_name,pack_units,status,payment_status,district,batch_id,order_items(flavor_name,quantity)")
      .eq("order_code", orderCode)
      .maybeSingle();

    if (orderError) {
      if (isMissingTable(orderError, "orders")) {
        warnings.push("order_source_unavailable");
      } else {
        warnings.push(`order_lookup_failed:${orderError.code ?? "unknown"}`);
      }
    } else if (orderRow) {
      let deliveryDate: string | null = null;

      if (orderRow.batch_id) {
        const { data: orderBatch } = await supabase
          .from("batches")
          .select("delivery_date")
          .eq("id", orderRow.batch_id)
          .maybeSingle();

        deliveryDate = orderBatch?.delivery_date ?? null;
      }

      order = {
        orderCode: orderRow.order_code,
        packName: orderRow.pack_name,
        packUnits: Number(orderRow.pack_units),
        status: orderRow.status,
        paymentStatus: orderRow.payment_status ?? null,
        deliveryDistrict: orderRow.district,
        deliveryDate,
        items: (orderRow.order_items ?? []).map((item: { flavor_name: string; quantity: number }) => ({
          flavor: item.flavor_name,
          quantity: Number(item.quantity),
        })),
      };
    }
  }

  const requestedDistrict = request.district?.trim() || null;
  const district = requestedDistrict
    ? districtOptions.find(
        (option) =>
          option.toLocaleLowerCase("es") === requestedDistrict.toLocaleLowerCase("es"),
      ) ?? null
    : null;

  if (requestedDistrict && !district) {
    warnings.push("delivery_district_unrecognized");
  }

  return {
    generatedAt: new Date().toISOString(),
    catalog: {
      flavors: flavors.map((flavor) => ({
        slug: flavor.slug,
        name: flavor.name,
        category: flavor.category,
        price: flavor.price,
        seasonal: Boolean(flavor.seasonal),
      })),
      packs: packs.map((pack) => ({
        slug: pack.slug,
        name: pack.name,
        units: pack.units,
        amount: pack.amount,
        packType: pack.packType,
      })),
    },
    batch,
    delivery: district
      ? {
          district,
          fee: getDeliveryFee(district),
        }
      : null,
    order,
    warnings,
  };
}
