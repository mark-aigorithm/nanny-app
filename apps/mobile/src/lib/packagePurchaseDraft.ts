export type PackageFlowParams = {
  packageId?: string;
  purchaseId?: string;
};

export function hasRequiredPackageCheckout(params: PackageFlowParams): boolean {
  return !!params.packageId;
}
