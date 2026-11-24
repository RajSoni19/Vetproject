import { SimplePublicPage } from "@/components/public-pages";

// Grouped, detailed answers. Each answer describes what the product does today.
export default function FaqPage() {
  return <SimplePublicPage eyebrow="FAQ" title="Frequently asked questions" description="Everything you need to know about scanning invoices, VAT, bank matching, ordering and your account." sections={[
    // Getting started
    { title: "What is VET THE VAT?", body: "VET THE VAT is an online tool for UK businesses. It reads your supplier invoices and receipts, keeps your VAT records organised, matches bank payments to invoices and compares supplier prices. ORS, our ordering tool, lets you send orders to suppliers by WhatsApp or email." },
    { title: "Who is it for?", body: "Restaurants, takeaways, shops, trades and any business that buys from suppliers regularly. Accountants and bookkeepers can also use it to receive clean, organised records from their clients." },
    { title: "How do I get started?", body: "Create an account, set up your company with its name, address, company number and mobile number, then upload your first invoice. Your first company gets a free 14-day trial with no card needed." },
    { title: "Can I use it on my phone?", body: "Yes. The full workspace works in your phone's browser, so you can photograph invoices with your camera. An Android app is also available on Google Play." },
    // Scanning invoices
    { title: "What can I upload?", body: "PDF invoices and photos of invoices or till receipts in JPG, PNG or WEBP format. Invoices of up to 20 pages are supported. Choose the supplier first if you know it, and the details are read for you." },
    { title: "What details are read from an invoice?", body: "Supplier name and VAT number, invoice number and date, each item with its quantity, price and VAT rate, and the net, VAT and total amounts. Cancelled (voided) till items are left out automatically." },
    { title: "Will the details always be read correctly?", body: "Most invoices are read accurately, but no system is perfect. You check every value before an invoice is saved, and the app warns you if the items do not add up to the invoice total." },
    { title: "What if an invoice can't be scanned?", body: "Use Create Manual Invoice to enter it yourself. This is also useful when a receipt is lost or you are waiting for a supplier's invoice." },
    { title: "Does it spot duplicate invoices?", body: "Yes. If an invoice with the same number already exists for that supplier, you are warned before saving it again." },
    // VAT
    { title: "Does it check supplier VAT numbers?", body: "Every UK VAT number is checked for errors automatically. One click on Check with HMRC opens HMRC's official VAT number checker, so you can confirm the supplier is registered." },
    { title: "How are zero-rated items handled?", body: "Each item keeps its own VAT rate, for example 20% for soft drinks and 0% for most food. Items with no VAT shown on the invoice are marked as such and no VAT is claimed for them." },
    { title: "Does VET THE VAT submit my VAT return?", body: "No. It prepares organised figures and Excel downloads for your accountant. Your accountant or you submit the VAT return to HMRC." },
    // Bank VAT matching
    { title: "What is Bank VAT Matching?", body: "Upload your bank statement as an Excel or CSV file with the date, supplier and amount. Each payment is matched to a saved invoice with the same amount and the VAT is added automatically. Payments without a matching invoice are listed with £0 VAT, so nothing is claimed without an invoice." },
    { title: "What if a payment isn't matched?", body: "Check the amount and supplier, then scan the missing invoice and press Check again. You can also confirm a suggested match or choose the right invoice yourself." },
    // Ordering and prices
    { title: "How does price comparison work?", body: "Every invoice you save builds a price list for each product. You can see which supplier is cheapest, get alerts when a price changes by 10% or more, and see how much you could save. Small spelling differences, such as Loose tomatoes and Tomatoes, are treated as the same product." },
    { title: "How do I order from a supplier?", body: "Add products to your cart in Price Comparison and send the order to each supplier by WhatsApp or email. The message lists the items and quantities." },
    // Reports and data
    { title: "How do I send figures to my accountant?", body: "Download confirmed invoices to Excel by month, quarter, year or custom dates, filtered by supplier if you like. Each row links back to its invoice. Bank VAT Matching has its own Export for accountant." },
    { title: "Can I manage more than one company?", body: "Yes. One account can hold several companies, each with its own invoices, suppliers and team members. Plan allowances are shared across your companies." },
    { title: "Can I invite my staff or accountant?", body: "Yes. Invite people to your company from Team and choose what each person can do." },
    // Security and account
    { title: "Is my data secure?", body: "Each company's data is kept separate and only people you invite can see it. All connections are encrypted, and every change to an invoice is recorded." },
    { title: "How do you handle personal data?", body: "Please read our privacy notice for what we collect, why, and how long we keep it." },
    { title: "What happens when my trial ends?", body: "You are never charged automatically. You can still view and download all your records, and you can choose a plan to keep adding invoices." },
    { title: "How do I get help?", body: "Use the Contact page, message us on WhatsApp, or email us. We aim to reply within one working day." }
  ]} />;
}
