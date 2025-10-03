// frontend/src/pages/Management/ImageUploads.jsx

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings, Image } from 'lucide-react';

/**
 * ImageUploads Page Component
 * Renders the main content for the /management/image-uploads route.
 * This modular structure ensures the component can be easily replaced 
 * with the full UI later.
 */
const ImageUploads = () => {
  return (
    <div className="p-6 h-full w-full">

      {/* Page Header */}
      <div className="flex items-center space-x-3 mb-6 pb-2 border-b border-border">
        <Image className="h-7 w-7 text-primary" />
        <h1 className="text-3xl font-extrabold tracking-tight">
          Management: Image Uploads
        </h1>
      </div>

      {/* Test Card: Validate Routing and Layout */}
      <Card className="shadow-lg border-l-4 border-l-green-500 max-w-4xl mx-auto mt-10">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-xl">
            <Settings className="h-5 w-5 text-green-500" />
            <span>Route Validation Successful!</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-lg text-foreground">
            This component is loaded correctly by React Router under the
            **Management** parent group.
          </p>
          <ul className="list-disc list-inside text-muted-foreground text-sm space-y-1">
            <li>**Current URL:** `/management/image-uploads`</li>
            <li>**Component Path:** `frontend/src/pages/Management/ImageUploads.jsx`</li>
            <li>**Next Step:** Integration of the actual file upload logic and UI.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default ImageUploads;
