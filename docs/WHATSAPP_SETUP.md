# Automatic WhatsApp due reminders – setup

With this set up, **Dues → WhatsApp → Send now** (and **Send to all automatically**)
sends the reminder straight from the software. WhatsApp does not open and nobody
has to press Send.

It uses Meta's official **WhatsApp Business Platform (Cloud API)** – the only way
WhatsApp allows software to send messages by itself. Until it is set up, the app
keeps working the old way (it opens WhatsApp with the message ready).

---

## What you need

- A **phone number for the business** that can receive an SMS/call once for
  verification. **It must not be logged in to the normal WhatsApp or WhatsApp
  Business app** – once it's on the Cloud API it can only send through the
  software. (Use a new SIM, or delete WhatsApp from that number first.)
- A **Facebook account** for the owner.
- A **payment card** for Meta (messages are charged per message – see *Cost*).
- About 30–60 minutes, plus waiting time for Meta's approvals (usually a few
  hours to a day).

## Step 1 – Create the Meta Business account

1. Go to **business.facebook.com** → **Create account**. Use the pump's legal
   name and address.
2. (Recommended) **Business settings → Security centre → Start verification**,
   upload a GST certificate / trade licence. Verification lifts sending limits.

## Step 2 – Create the WhatsApp app

1. Go to **developers.facebook.com** → **My Apps → Create app** → choose
   **Business** → link it to the business account from Step 1.
2. In the app, **Add product → WhatsApp → Set up**.

## Step 3 – Add the business phone number

1. **WhatsApp → API Setup → Add phone number**.
2. Enter the display name (e.g. *Kalyani Fuel Station*), category, and the phone
   number. Verify it with the code Meta sends.
3. Copy the **Phone number ID** shown under the number (a long number like
   `112233445566778`). → this is `WHATSAPP_PHONE_NUMBER_ID`.

## Step 4 – Create a permanent access token

The token on the API Setup page expires in 24 hours. Make a permanent one:

1. **business.facebook.com → Business settings → Users → System users → Add**
   (name: `fuel-ledger`, role: **Admin**).
2. **Add assets** → Apps → your app → **Full control**.
   Also **WhatsApp accounts** → your WhatsApp account → **Full control**.
3. **Generate new token** → choose your app → expiry **Never** → tick
   `whatsapp_business_messaging` and `whatsapp_business_management` → Generate.
4. Copy the token (starts with `EAA…`). → this is `WHATSAPP_TOKEN`.
   Keep it secret – never put it in chat or in the code.

## Step 5 – Add a payment method

**WhatsApp Manager → Account tools → Payment methods** (or Business settings →
Payments) → add a card. Without it, messages fail with a payment error.

## Step 6 – Create the message template

WhatsApp only lets a business start a conversation with an **approved
template**. Create exactly this one:

1. **WhatsApp Manager → Account tools → Message templates → Create template**.
2. Category: **Utility**. Name: **`due_reminder`**. Language: **English**.
3. Body (copy exactly – 5 variables in this order):

   ```
   Namaskar {{1}}, this is a reminder from {{2}} about your due (credit) amount. Outstanding balance: Rs. {{3}}. Please pay at the pump in cash or by UPI ({{4}}). For any query call {{5}}. Thank you.
   ```

   Sample values Meta asks for: `Ghosh Transport`, `Kalyani Fuel Station`,
   `11,451.00`, `kalyanifuels@okaxis`, `7439195024`.
4. Submit. Then **Add language → Bengali** to the same template name with:

   ```
   নমস্কার {{1}}, {{2}} থেকে আপনার বাকি টাকার কথা মনে করিয়ে দিচ্ছি। মোট বাকি: Rs. {{3}}। অনুগ্রহ করে পাম্পে নগদ বা ইউপিআই ({{4}})-তে টাকা দিন। কোনো প্রশ্নে ফোন করুন {{5}}। ধন্যবাদ।
   ```

   (Skip Bengali if you only send in English.)
5. Wait for **Approved** (usually minutes to a few hours).

The app fills in: {{1}} customer name, {{2}} station name, {{3}} balance,
{{4}} UPI ID and {{5}} contact number from **Settings → WhatsApp due reminders**.

## Step 7 – Add the keys in Vercel

**Vercel → your project → Settings → Environment Variables**, add (Production
and Preview):

| Name | Value |
|---|---|
| `WHATSAPP_TOKEN` | the `EAA…` token from Step 4 |
| `WHATSAPP_PHONE_NUMBER_ID` | the Phone number ID from Step 3 |
| `WHATSAPP_TEMPLATE` | *(optional)* only if you named the template something other than `due_reminder` |

Then **Deployments → ⋯ → Redeploy**.

## Step 8 – Check it

1. Open the app → **Settings → WhatsApp due reminders**. It should say
   **✓ Connected**.
2. **Dues** → a customer → **WhatsApp** → the window now shows **Send now**.
   Send one test to your own mobile number first.

---

## Cost

Meta charges per delivered template message. For India, *Utility* messages have
been a fraction of a rupee each, *Marketing* messages more – check the current
price list at **developers.facebook.com/docs/whatsapp/pricing**. The due reminder
is a Utility template. Meta bills the card added in Step 5.

## Common errors (shown in the app in plain words)

| Message in the app | What to do |
|---|---|
| Access token is invalid or expired | Make a new permanent token (Step 4), update `WHATSAPP_TOKEN`, redeploy |
| Template not found or not approved | Check the template name is `due_reminder`, status Approved, and the language you chose (English/Bengali) exists |
| Template variables don't match | The template body must have exactly `{{1}}` … `{{5}}` |
| Test mode: add this number… | While the app is in development mode, add the customer number under API Setup → *To*, or complete business verification |
| Payment issue | Add a payment method (Step 5) |
| Number is not on WhatsApp | The customer's number has no WhatsApp – call or SMS instead |
