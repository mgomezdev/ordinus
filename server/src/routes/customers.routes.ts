import { Router } from 'express';
import * as customersController from '../controllers/customers.controller.js';

const router = Router();

router.get('/', customersController.listCustomers);
router.post('/', customersController.createCustomer);
router.put('/:id', customersController.updateCustomer);
router.delete('/:id', customersController.deleteCustomer);

router.get('/:id/parts', customersController.getCustomerParts);
router.post('/:id/parts/:partId', customersController.associatePart);
router.delete('/:id/parts/:partId', customersController.dissociatePart);

router.get('/:id/ref-images', customersController.getCustomerRefImages);
router.post('/:id/ref-images/:refImageId', customersController.associateRefImage);
router.delete('/:id/ref-images/:refImageId', customersController.dissociateRefImage);

export default router;
