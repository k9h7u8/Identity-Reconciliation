// src/index.ts

import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const app = express();
app.use(express.json());
const prisma = new PrismaClient();

const PORT = process.env.PORT || 3000;

app.post('/identify', async (req: Request, res: Response) => {
    const { email, phoneNumber } = req.body;

    // A. Handle invalid requests
    if (!email && !phoneNumber) {
        return res.status(400).json({ error: 'Email or phoneNumber is required' });
    }

    try {
        // B. Find existing contacts matching email or phoneNumber
        const matchingContacts = await prisma.contact.findMany({
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
            const newPrimaryContact = await prisma.contact.create({
                data: {
                    email,
                    phoneNumber,
                    linkPrecedence: 'primary'
                }
            });
            return res.status(200).json({
                contact: {
                    primaryContatctId: newPrimaryContact.id,
                    emails: [newPrimaryContact.email].filter(Boolean) as string[],
                    phoneNumbers: [newPrimaryContact.phoneNumber].filter(Boolean) as string[],
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
            await prisma.contact.updateMany({
                where: { id: { in: secondariesToUpdate.map(c => c.id) } },
                data: { linkPrecedence: 'secondary', linkedId: primaryId }
            });

            // Update all secondaries of the other primaries to link to the new primary
            const allSecondaryIds = secondariesToUpdate.map(c => c.id);
            await prisma.contact.updateMany({
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
            await prisma.contact.create({
                data: {
                    email,
                    phoneNumber,
                    linkPrecedence: 'secondary',
                    linkedId: primaryId
                }
            });
        }
        
        // F. Consolidate and return response
        const allLinkedContacts = await prisma.contact.findMany({
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

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});