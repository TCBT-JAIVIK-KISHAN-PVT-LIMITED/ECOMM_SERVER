/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from './schemas/user.schema';
import { CrmService } from '../../zoho/crm/crm.service';
import { ZohoInventoryService } from '../../zoho/inventory/inventory.service';
import { AddAddressDto } from './dto/add-address.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
    private crmService: CrmService,
    private inventoryService: ZohoInventoryService,
  ) {}

  // 🔹 Find by mobile
  async findByMobile(mobile: string) {
    return this.userModel.findOne({ mobile_number: mobile });
  }

  // 🔹 Find by ID
  async findById(id: string) {
    return this.userModel.findById(id);
  }

  // 🔹 Create or Get user (OTP flow)
  async findOrCreateUser(mobile: string) {
    let user = await this.findByMobile(mobile);

    if (!user) {
      user = await this.userModel.create({
        mobile_number: mobile,
      });
    }

    return user;
  }

  // 🔹 Update user
  async updateUser(id: string, data: any) {
    const cleanId = id.replace(/[^a-fA-F0-9]/g, '');

    const user = await this.userModel.findByIdAndUpdate(cleanId, data, {
      new: true,
    });

    if (!user) throw new Error('User not found');

    const contactPayload = {
      name: user.name,
      mobile_number: user.mobile_number,
      email: user.email,
    };

    if (!user.zoho_contact_id) {
      // ── New user: create contact in Zoho Inventory + CRM ─────────────────
      // Run both in parallel; failures are non-fatal (logged, not thrown).
      const [inventoryId] = await Promise.allSettled([
        // Inventory — createOrGetContact returns the contact_id
        this.inventoryService
          .createOrGetContact(contactPayload)
          .then(async (contactId) => {
            // Save contact_id back to MongoDB so future updates use it
            await this.userModel.findByIdAndUpdate(cleanId, {
              zoho_contact_id: contactId,
            });
            console.log(
              `[Users] ✅ Zoho Inventory contact created: ${contactId} for user ${cleanId}`,
            );
            return contactId;
          }),
        // CRM — upsertContact handles search + create
        this.crmService
          .upsertContact({
            name: user.name,
            mobile_number: user.mobile_number,
            email: user.email,
          })
          .then((crmId) => {
            console.log(
              `[Users] ✅ Zoho CRM contact upserted: ${crmId} for user ${cleanId}`,
            );
          }),
      ]);

      if (inventoryId.status === 'rejected') {
        console.error(
          '[Users] Zoho Inventory contact creation failed:',
          inventoryId.reason,
        );
      }
    } else {
      // ── Returning user: update both Zoho systems ──────────────────────────
      await Promise.allSettled([
        this.crmService
          .updateContact(user.zoho_contact_id, {
            First_Name: user.name,
            Email: user.email,
            Phone: user.mobile_number,
          })
          .then(() =>
            console.log(
              `[Users] ✅ Zoho CRM contact updated: ${user.zoho_contact_id}`,
            ),
          ),
        this.inventoryService
          .updateContact(user.zoho_contact_id, {
            name: user.name,
            email: user.email,
            phone: user.mobile_number,
          })
          .then(() =>
            console.log(
              `[Users] ✅ Zoho Inventory contact updated: ${user.zoho_contact_id}`,
            ),
          ),
      ]);
    }

    return user;
  }

  // 🔹 Add address
  async addAddress(userId: string, address: AddAddressDto) {
    const cleanId = userId.replace(/[^a-fA-F0-9]/g, '');

    const user = await this.userModel.findById(cleanId);
    if (!user) {
      throw new Error('User not found');
    }

    try {
      const updatedUser = await this.userModel.findByIdAndUpdate(
        cleanId,
        {
          $push: {
            addresses: address,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      );

      return updatedUser?.addresses;
    } catch (error: any) {
      console.error('❌ ADD ADDRESS ERROR:', error.message);
      throw error;
    }
  }

  // update address
  async updateAddress(
    userId: string,
    addressId: string,
    updateData: Partial<AddAddressDto>,
  ) {
    const cleanUserId = userId.replace(/[^a-fA-F0-9]/g, '');

    const user = await this.userModel.findById(cleanUserId);
    if (!user) {
      throw new Error('User not found');
    }

    try {
      const addressObjectId = new Types.ObjectId(addressId);
      const updatedUser = await this.userModel.findOneAndUpdate(
        {
          _id: cleanUserId,
          'addresses._id': addressObjectId,
        },
        {
          $set: {
            'addresses.$': {
              ...updateData,
              _id: addressObjectId, // preserve ID
            },
          },
        },
        {
          new: true,
          runValidators: true,
        },
      );

      if (!updatedUser) {
        throw new Error('Address not found');
      }

      return updatedUser.addresses.find(
        (addr: any) => addr._id.toString() === addressId,
      );
    } catch (error: any) {
      console.error('❌ UPDATE ADDRESS ERROR:', error.message);
      throw error;
    }
  }

  // 🔹 Find addresses by user ID
  async findAddressesByUserId(userId: string) {
    const user = await this.userModel.findById(userId);
    return user?.addresses || [];
  }

  // 🔹 Find specific address by ID
  async findAddressById(userId: string, addressId: string) {
    const user = await this.userModel.findById(userId);
    return (
      user?.addresses.find((addr: any) => addr._id.toString() === addressId) ||
      null
    );
  }

  // 🔹 Delete address
  async deleteAddress(userId: string, addressId: string) {
    console.log('--- DELETE ADDRESS ---');
    console.log('User ID:', userId);
    console.log('Address ID:', addressId);

    try {
      // Get the user first to verify the address exists
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const beforeCount = user.addresses.length;

      // Cast to ObjectId so $pull actually matches the subdocument _id
      const updatedUser = await this.userModel.findByIdAndUpdate(
        userId,
        {
          $pull: {
            addresses: { _id: new Types.ObjectId(addressId) },
          },
        },
        { new: true },
      );

      if (!updatedUser) {
        throw new Error('User not found after update');
      }

      const afterCount = updatedUser.addresses.length;
      if (beforeCount === afterCount) {
        console.warn(
          '⚠️ Address was NOT removed — ID may not match:',
          addressId,
        );
        throw new Error('Address not found or already deleted');
      }

      console.log(`✅ Address removed (${beforeCount} → ${afterCount})`);
      return updatedUser.addresses;
    } catch (error: any) {
      console.log('❌ DELETE ERROR:', error.message);
      throw error;
    }
  }
}
