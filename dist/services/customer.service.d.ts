export declare const CustomerService: {
    createCustomer(data: {
        rfc: string;
        razonSocial: string;
        email: string;
        commerceId: string;
    }): Promise<{
        id: string;
        rfc: string;
        razonSocial: string;
        email: string;
        createdAt: Date;
        commerceId: string;
    }>;
    listCustomers(): Promise<{
        id: string;
        rfc: string;
        razonSocial: string;
        email: string;
        createdAt: Date;
        commerceId: string;
    }[]>;
};
//# sourceMappingURL=customer.service.d.ts.map