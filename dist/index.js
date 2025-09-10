"use strict";
// src/index.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const app = (0, express_1.default)();
app.use(express_1.default.json());
const prisma = new client_1.PrismaClient();
const PORT = process.env.PORT || 3000;
app.post('/identify', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, phoneNumber } = req.body;
    // A. Handle invalid requests
    if (!email && !phoneNumber) {
        return res.status(400).json({ error: 'Email or phoneNumber is required' });
    }
    try {
        // B. Find existing contacts matching email or phoneNumber
        const matchingContacts = yield prisma.contact.findMany({
            where: {
                OR: [
                    { email: email },
                    { phoneNumber: phoneNumber }
                ]
            },
            orderBy: {
                createdAt: 'asc'
            }
        });
        // C. Case: No matching contacts found
        if (matchingContacts.length === 0) {
            const newPrimaryContact = yield prisma.contact.create({
                data: {
                    email,
                    phoneNumber,
                    linkPrecedence: 'primary'
                }
            });
            return res.status(200).json({
                contact: {
                    primaryContatctId: newPrimaryContact.id,
                    emails: [newPrimaryContact.email].filter(Boolean),
                    phoneNumbers: [newPrimaryContact.phoneNumber].filter(Boolean),
                    secondaryContactIds: []
                }
            });
        }
        // D. Case: Matching contacts found
        const primaryContacts = matchingContacts.filter(c => c.linkPrecedence === 'primary');
        const secondaryContacts = matchingContacts.filter(c => c.linkPrecedence === 'secondary');
        let primaryId = primaryContacts[0].id;
        // Find the ultimate primary contact (the oldest one)
        let primaryContact = primaryContacts[0];
        if (primaryContacts.length > 1) {
            // This is the merge scenario: two or more primary contacts are linked by the new request.
            const oldestPrimary = primaryContacts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
            primaryId = oldestPrimary.id;
            // Downgrade all other primaries to secondary
            const secondariesToUpdate = primaryContacts.filter(c => c.id !== primaryId);
            yield prisma.contact.updateMany({
                where: { id: { in: secondariesToUpdate.map(c => c.id) } },
                data: { linkPrecedence: 'secondary', linkedId: primaryId }
            });
            // Update all secondaries of the other primaries to link to the new primary
            const allSecondaryIds = secondariesToUpdate.map(c => c.id);
            yield prisma.contact.updateMany({
                where: { linkedId: { in: allSecondaryIds } },
                data: { linkedId: primaryId }
            });
        }
        // E. Check if a new secondary contact needs to be created
        const emailsInSet = new Set(matchingContacts.map(c => c.email));
        const phonesInSet = new Set(matchingContacts.map(c => c.phoneNumber));
        const isEmailNew = email && !emailsInSet.has(email);
        const isPhoneNew = phoneNumber && !phonesInSet.has(phoneNumber);
        if (isEmailNew || isPhoneNew) {
            yield prisma.contact.create({
                data: {
                    email,
                    phoneNumber,
                    linkPrecedence: 'secondary',
                    linkedId: primaryId
                }
            });
        }
        // F. Consolidate and return response
        const allLinkedContacts = yield prisma.contact.findMany({
            where: {
                OR: [
                    { id: primaryId },
                    { linkedId: primaryId }
                ]
            },
            orderBy: {
                createdAt: 'asc'
            }
        });
        const consolidatedEmails = Array.from(new Set(allLinkedContacts.map(c => c.email).filter(Boolean)));
        const consolidatedPhones = Array.from(new Set(allLinkedContacts.map(c => c.phoneNumber).filter(Boolean)));
        const secondaryIds = allLinkedContacts.filter(c => c.linkPrecedence === 'secondary').map(c => c.id);
        res.status(200).json({
            contact: {
                primaryContatctId: primaryId,
                emails: consolidatedEmails,
                phoneNumbers: consolidatedPhones,
                secondaryContactIds: secondaryIds
            }
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}));
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
