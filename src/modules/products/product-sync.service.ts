import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';

import { Product } from './schemas/product.schema';
import { ZohoInventoryService } from '../../zoho/inventory/inventory.service';
import { ZohoImageSyncService } from '../../integrations/zoho-image-sync/zoho-image-sync.service';

interface ZohoItem {
    item_id: string;
    group_id?: string;
    group_name?: string;
    name: string;
    description?: string;
    sku?: string;
    status: 'active' | 'inactive';
    rate: number;
    stock_on_hand?: number;
    available_stock?: number;
    actual_available_stock?: number;
    category_id?: string;
    category_name?: string;
    brand?: string;
    manufacturer?: string;
    hsn_or_sac?: string;
    product_type?: string;
    item_type?: string;
    track_inventory?: boolean;
    is_taxable?: boolean;

    weight?: number | string;
    weight_unit?: string;
    length?: number | string;
    width?: number | string;
    height?: number | string;
    dimension_unit?: string;
    dimensions_with_unit?: string;
    weight_with_unit?: string;

    image_name?: string;
    image_type?: string;
    image_document_id?: string;

    attribute_name1?: string;
    attribute_name2?: string;
    attribute_name3?: string;
    attribute_option_name1?: string;
    attribute_option_name2?: string;
    attribute_option_name3?: string;
}

function toNum(value: any): number {
    const n = Number(value);
    return isNaN(n) ? 0 : n;
}


function extractAttributes(item: ZohoItem): Record<string, string> {
    const attrs: Record<string, string> = {};
    const axes = [
        ['attribute_name1', 'attribute_option_name1'],
        ['attribute_name2', 'attribute_option_name2'],
        ['attribute_name3', 'attribute_option_name3'],
    ] as const;

    for (const [nameKey, valueKey] of axes) {
        const name = item[nameKey];
        const value = item[valueKey];
        if (name && value) {
            attrs[name] = value;
        }
    }
    return attrs;
}


function extractAttributeNames(items: ZohoItem[]): string[] {
    const names = new Set<string>();
    for (const item of items) {
        if (item.attribute_name1) names.add(item.attribute_name1);
        if (item.attribute_name2) names.add(item.attribute_name2);
        if (item.attribute_name3) names.add(item.attribute_name3);
    }
    return [...names];
}

function shouldSyncItem(item: ZohoItem): boolean {

    if (item.status !== 'active') {
        return false;
    }

    if (item.item_type !== 'inventory') {
        return false;
    }

    if (!item.category_id || !item.category_name) {
        return false;
    }

    if (!item.sku || item.sku.trim().length < 2) {
        return false;
    }

    const stock = toNum(
        item.actual_available_stock ??
        item.available_stock ??
        item.stock_on_hand,
    );

    if (stock < 1) {
        return false;
    }

    if (toNum(item.rate) <= 0) {
        return false;
    }

    if (!item.image_document_id) {
        return false;
    }

    return true;
}

function buildVariant(item: ZohoItem) {
    return {
        zoho_item_id: String(item.item_id),

        sku: item.sku ?? '',

        name: item.name,

        price: toNum(item.rate),

        stock: toNum(
            item.actual_available_stock ??
            item.available_stock ??
            item.stock_on_hand,
        ),

        attributes: extractAttributes(item),

        weight: toNum(item.weight),

        weight_unit: item.weight_unit ?? 'kg',

        dimensions_with_unit:
            item.dimensions_with_unit ?? '',

        weight_with_unit:
            item.weight_with_unit ?? '',

        image: null,

        is_active: item.status === 'active',
    };
}

function buildProductFromGroup(
    groupId: string,
    groupName: string,
    items: ZohoItem[],
    isVariant: boolean,
): any {
    const activeItems = items.filter(
        (i) => i.status === 'active',
    );

    const primary = activeItems[0] ?? items[0];

    const variants = items.map(buildVariant);

    const totalStock = variants
        .filter((v) => v.is_active)
        .reduce((s, v) => s + v.stock, 0);

    return {
        zoho_item_id: groupId,

        zoho_group_id: isVariant
            ? groupId
            : '',

        name: isVariant
            ? groupName
            : primary.name,

        description: primary.description ?? '',

        sku: primary.sku ?? '',

        category_id: primary.category_id ?? '',

        category_name:
            primary.category_name ?? '',

        brand: primary.brand ?? '',

        manufacturer:
            primary.manufacturer ?? '',

        price: toNum(primary.rate),

        stock: totalStock,

        weight: toNum(primary.weight),

        weight_unit:
            primary.weight_unit ?? 'kg',

        dimensions_with_unit:
            primary.dimensions_with_unit ?? '',

        zoho_image_document_id:
            primary.image_document_id ?? '',

        has_variants: isVariant,

        variant_attribute_names: isVariant
            ? extractAttributeNames(items)
            : [],

        variants: isVariant
            ? variants
            : [buildVariant(primary)],

        is_active: activeItems.length > 0,
    };
}

@Injectable()
export class ProductSyncService {
    private readonly logger = new Logger(ProductSyncService.name);

    private syncInProgress = false;

    constructor(
        @InjectModel(Product.name)
        private readonly productModel: Model<Product>,
        private readonly zohoInventoryService: ZohoInventoryService,
        private readonly zohoImageSyncService: ZohoImageSyncService,
    ) { }

    @Cron('0 */6 * * *')
    async syncAllProducts(): Promise<void> {
        if (this.syncInProgress) {
            this.logger.warn('⏭️  Sync already running — skipping this trigger');
            return;
        }
        this.syncInProgress = true;

        this.logger.log('🔄 Starting full product sync from Zoho Inventory...');
        const start = Date.now();

        try {

            const allItems: ZohoItem[] = await this.zohoInventoryService.getAllItems();
            this.logger.log(`📦 Fetched ${allItems.length} items from Zoho`);


            const validItems = allItems.filter(
                shouldSyncItem,
            );

            this.logger.log(
                `✅ ${validItems.length} sellable items after filtering`,
            );

            const grouped = this.groupItems(validItems);
            this.logger.log(`🗂️  Resolved to ${grouped.size} products (grouped + standalone)`);


            let synced = 0;
            let failed = 0;
            const seenProductIds = new Set<string>();

            for (const [productId, { groupId, groupName, items, isVariant }] of grouped) {
                try {
                    await this.syncOneProduct(productId, groupId, groupName, items, isVariant);
                    seenProductIds.add(productId);
                    synced++;

                    await new Promise((r) => setTimeout(r, 200));
                } catch (err: any) {
                    this.logger.error(`❌ Failed to sync product ${productId}: ${err.message}`);
                    failed++;
                }
            }


            if (failed === 0) {

                const deactivated =
                    await this.productModel.updateMany(
                        {
                            zoho_item_id: {
                                $nin: [...seenProductIds],
                            },
                            is_active: true,
                        },
                        {
                            $set: { is_active: false },
                        },
                    );

                if (deactivated.modifiedCount > 0) {
                    this.logger.log(
                        `🗂️  Deactivated ${deactivated.modifiedCount} products no longer in Zoho`,
                    );
                }

            } else {

                this.logger.warn(
                    '⚠️ Skipping deactivation due to sync failures',
                );

            }

            const elapsed = ((Date.now() - start) / 1000).toFixed(1);
            this.logger.log(
                `✅ Sync complete in ${elapsed}s — synced: ${synced}, failed: ${failed}`,
            );
        } catch (err: any) {
            this.logger.error(`💥 Full sync failed: ${err.message}`);
        } finally {
            this.syncInProgress = false;
        }
    }

    async syncSingleItem(zohoItemId: string): Promise<void> {
        this.logger.log(`🔁 Webhook sync for item: ${zohoItemId}`);

        const item = await this.zohoInventoryService.getItem(zohoItemId);

        if (!item) {
            this.logger.warn(`⚠️ Item ${zohoItemId} not found in Zoho — deactivating`);

            await this.productModel.updateOne(
                {
                    $or: [
                        { zoho_item_id: zohoItemId },
                        { 'variants.zoho_item_id': zohoItemId },
                    ],
                },
                { $set: { is_active: false } },
            );

            return;
        }


        if (item.group_id) {
            const allItems = await this.zohoInventoryService.getAllItems();

            const siblings = allItems.filter(
                (i: ZohoItem) => i.group_id === item.group_id,
            );

            await this.syncOneProduct(
                item.group_id,
                item.group_id,
                item.group_name ?? item.name,
                siblings,
                true,
            );
        }


        else {
            await this.syncOneProduct(
                zohoItemId,
                '',
                item.name,
                [item],
                false,
            );
        }
    }

    async deleteByZohoItemId(zohoItemId: string): Promise<void> {
        this.logger.log(`🗑️  Deleting item: ${zohoItemId}`);

        const product = await this.productModel.findOne({
            $or: [
                { zoho_item_id: zohoItemId },
                { 'variants.zoho_item_id': zohoItemId },
            ],
        });

        if (!product) {
            this.logger.warn(`⚠️  Item ${zohoItemId} not found in DB`);
            return;
        }


        const keysToDelete = this.collectS3Keys(product);
        await Promise.allSettled(
            keysToDelete.map((key) =>
                this.zohoImageSyncService.deleteFromS3(key),
            ),
        );

        await this.productModel.deleteOne({ _id: product._id });
        this.logger.log(`✅ Deleted product ${product.zoho_item_id} from DB and S3`);
    }

    private groupItems(items: ZohoItem[]): Map<
        string,
        { groupId: string; groupName: string; items: ZohoItem[]; isVariant: boolean }
    > {
        const map = new Map<
            string,
            { groupId: string; groupName: string; items: ZohoItem[]; isVariant: boolean }
        >();

        for (const item of items) {

            if (item.group_id) {

                const existing = map.get(item.group_id);

                if (existing) {
                    existing.items.push(item);
                } else {
                    map.set(item.group_id, {
                        groupId: item.group_id,
                        groupName: item.group_name ?? item.name,
                        items: [item],
                        isVariant: true,
                    });
                }

            } else {

                map.set(item.item_id, {
                    groupId: item.item_id,
                    groupName: item.name,
                    items: [item],
                    isVariant: false,
                });

            }
        }

        return map;
    }

    private async syncOneProduct(
        productId: string,
        groupId: string,
        groupName: string,
        items: ZohoItem[],
        isVariant: boolean,
    ): Promise<void> {

        const productData = buildProductFromGroup(productId, groupName, items, isVariant);


        const existing = await this.productModel
            .findOne({ zoho_item_id: productId })
            .lean();


        if (isVariant) {

            for (const item of items) {
                const variantIdx = productData.variants.findIndex(
                    (v: any) => v.zoho_item_id === String(item.item_id),
                );
                if (variantIdx === -1) continue;

                const existingVariant = (existing as any)?.variants?.find(
                    (v: any) => v.zoho_item_id === String(item.item_id),
                );

                const imageMeta = await this.zohoImageSyncService.syncImageForItem(
                    String(item.item_id),
                    item.image_name,
                    existingVariant?.image ?? null,
                );
                productData.variants[variantIdx].image = imageMeta;
            }


            const firstActiveVariant = productData.variants.find(
                (v: any) => v.is_active && v.image,
            );
            productData.image = firstActiveVariant?.image ?? null;
        } else {

            const singleItem = items[0];
            const imageMeta = await this.zohoImageSyncService.syncImageForItem(
                String(singleItem.item_id),
                singleItem.image_name,
                (existing as any)?.image ?? null,
            );
            productData.image = imageMeta;
            if (productData.variants[0]) {
                productData.variants[0].image = imageMeta;
            }
        }


        await this.productModel.findOneAndUpdate(
            { zoho_item_id: productId },
            productData,
            { upsert: true, new: true },
        );

        this.logger.verbose(
            `✅ Upserted product ${productId} (${isVariant ? productData.variants.length + ' variants' : 'standalone'})`,
        );
    }


    private collectS3Keys(product: any): string[] {
        const keys: string[] = [];
        if (product?.image?.image_s3_key) keys.push(product.image.image_s3_key);
        for (const v of product?.variants ?? []) {
            if (v?.image?.image_s3_key) keys.push(v.image.image_s3_key);
        }
        return [...new Set(keys)];
    }
}