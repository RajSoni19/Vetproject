"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Save } from "lucide-react";
import { useAppState } from "@/components/app-state";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Supplier } from "@/lib/domain";

export default function NewSupplierPage() {
  const router = useRouter();
  const { selectedCompany, saveSupplier } = useAppState();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<Supplier["status"]>("Active");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Supplier name is required.");
      return;
    }
    setError("");
    setIsSubmitting(true);

    try {
      const newSupplier: Supplier = {
        id: `supplier-${crypto.randomUUID()}`,
        companyId: selectedCompany.id,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        vatNumber: vatNumber.trim(),
        address: address.trim(),
        status
      };

      saveSupplier(newSupplier);
      showToast({ title: "Supplier created", description: `${name} has been added to your suppliers.`, tone: "success" });
      router.push("/app/suppliers");
    } catch (err: any) {
      setError(err.message || "Failed to create supplier.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div>
          <h1 className="text-2xl font-bold">Add Supplier</h1>
          <p className="text-xs text-muted">Add a new supplier for {selectedCompany.name}.</p>
        </div>
        <Link href="/app/suppliers" className="text-sm font-semibold text-brand-700 underline">
          &larr; Back to Suppliers
        </Link>
      </div>

      <Card className="p-6">
        {error ? <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
        <form onSubmit={handleSubmit} className="grid gap-4">
          <label className="grid gap-1 text-sm font-semibold">
            Supplier Name *
            <input
              required
              className="field-control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. RK FRUITS &amp; VEGETABLES LIMITED"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">
              Email Address
              <input
                type="email"
                className="field-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="supplier@example.com"
              />
            </label>

            <label className="grid gap-1 text-sm font-semibold">
              Phone Number
              <input
                className="field-control"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+44 20 ..."
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">
              VAT Registration Number
              <input
                className="field-control"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                placeholder="e.g. GB 123 4567 89"
              />
            </label>

            <label className="grid gap-1 text-sm font-semibold">
              Status
              <select
                className="field-control"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
              >
                <option value="Active">Active</option>
                <option value="Review">Needs Review</option>
                <option value="Archived">Archived</option>
              </select>
            </label>
          </div>

          <label className="grid gap-1 text-sm font-semibold">
            Registered Address
            <textarea
              className="field-control min-h-[80px]"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street address, city, postcode..."
            />
          </label>

          <div className="mt-2 flex gap-3">
            <Button type="submit" disabled={isSubmitting}>
              <Save className="mr-1.5 h-4 w-4" /> Save Supplier
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/app/suppliers")}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
